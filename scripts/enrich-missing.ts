/**
 * Enrich any jobs that have a JD but no fit_score yet.
 *
 * `refresh-feed` only enriches jobs it inserts in the same run, so rows that
 * were inserted while the LLM was unavailable (rate-limited, out of credits,
 * or no key set) stay unscored forever. Run this after restoring LLM access to
 * backfill fit scores for the existing feed without re-fetching:
 *
 *     npm run enrich-missing
 */
import { getDb } from "../src/lib/db";
import { ResumeData } from "../src/lib/resume";
import { NormalizedJob } from "../src/lib/jobs/types";
import { enrichJob } from "../src/lib/jobs/enrich";
import { hasLlmKey } from "../src/lib/llm";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — enrichment needs an LLM key, handled below
}

interface JobRow {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  posted_date: string | null;
  jd_text: string | null;
  url: string | null;
  salary_range: string | null;
}

async function main() {
  // enrichJob falls back to the offline heuristic when no key is set, so this
  // runs either way — just tell the user which mode they'll get.
  console.log(
    hasLlmKey()
      ? `Using LLM provider "${process.env.LLM_PROVIDER || "claude"}".`
      : "No LLM key set — using the offline heuristic scorer (free, no API calls)."
  );

  const db = getDb();
  const masterRow = db
    .prepare("SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1")
    .get() as { content_json: string } | undefined;
  const resume: ResumeData | null = masterRow
    ? (JSON.parse(masterRow.content_json) as ResumeData)
    : null;

  // No jd_text filter: title-only jobs (e.g. LinkedIn cards) still get a
  // domain-based heuristic score, and the LLM prompt tolerates a missing JD.
  const rows = db
    .prepare("SELECT * FROM jobs WHERE fit_score IS NULL ORDER BY id")
    .all() as JobRow[];

  console.log(`Enriching ${rows.length} unscored job(s)…`);

  const update = db.prepare(
    `UPDATE jobs SET sponsorship_tag = ?, seniority_tag = ?, min_years = ?,
      fit_score = ?, fit_summary = ?, enriched_at = datetime('now') WHERE id = ?`
  );

  let enriched = 0;
  const errors: string[] = [];
  // Optional throttle between calls (ms). Set ENRICH_DELAY_MS=7000 to stay under
  // Gemini's free-tier 10 req/min when re-scoring a large batch. Default 0.
  const delayMs = Number(process.env.ENRICH_DELAY_MS || 0);
  // Serial (not concurrent) so a thin rate limit doesn't fail the whole batch.
  for (const row of rows) {
    if (delayMs > 0 && enriched > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const e = await enrichJob(
        {
          source: row.source,
          company: row.company,
          title: row.title,
          location: row.location,
          remoteType: (row.remote_type as NormalizedJob["remoteType"]) || "unknown",
          postedDate: row.posted_date,
          jdText: row.jd_text,
          url: row.url,
          salaryRange: row.salary_range,
        },
        resume
      );
      update.run(e.sponsorshipTag, e.seniorityTag, e.minYears, e.fitScore, e.fitSummary, row.id);
      enriched++;
      console.log(`  [${e.fitScore}] ${row.title} @ ${row.company}`);
    } catch (err) {
      errors.push(`job ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`Done: enriched ${enriched}/${rows.length}.`);
  if (errors.length) {
    console.log(`  ${errors.length} error(s):`);
    for (const e of errors) console.log(`   - ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
