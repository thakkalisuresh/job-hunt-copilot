/**
 * Auto-tailor poller (BACKLOG — auto-run the resume pipeline on save).
 *
 * For every application still in "saved" status with no tailored resume yet,
 * runs Diagnose -> Keywords -> Rewrite -> Outreach automatically, gated on
 * the job's fit score so low-fit postings aren't tailored for free.
 *
 * Uses the background LLM provider (Gemini, if GOOGLE_API_KEY/GEMINI_API_KEY
 * is set, to keep this free) — see getBackgroundProvider() in src/lib/llm.ts.
 * The resume_version_id IS NULL gate makes this safe to re-run: anything that
 * already got tailored (or failed partway and left a resume version) is
 * skipped, and anything that errors (e.g. rate limit) is retried next run.
 *
 * Run manually via `npm run auto-tailor`, or on a schedule (see
 * scripts/install-schedule.ts).
 */
import { getDb } from "../src/lib/db";
import { getBackgroundProvider, hasLlmKey } from "../src/lib/llm";
import { autoTailorApplication } from "../src/lib/auto-pipeline";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — checks below will report what's missing
}

// Minimum fit_score (0-100) for a job to be auto-tailored. open-jobs rows use a
// tighter threshold (default 82) since there are many more of them.
const MIN_FIT = Number(process.env.AUTO_TAILOR_MIN_FIT || 70);
const MIN_FIT_OJ = Number(process.env.AUTO_TAILOR_MIN_FIT_OPEN_JOBS || 82);

interface CandidateRow {
  application_id: number;
  company: string;
  title: string;
  fit_score: number | null;
}

async function main() {
  const started = new Date().toISOString();
  console.log(`[${started}] auto-tailor starting… (min fit score ${MIN_FIT})`);

  if (!hasLlmKey()) {
    console.log("No LLM key configured — cannot run the tailoring pipeline. Skipping.");
    return;
  }

  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT a.id as application_id, j.company, j.title, j.fit_score
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('saved', 'tailoring')
         AND a.resume_version_id IS NULL
         AND j.fit_score IS NOT NULL
         AND (
           (j.source NOT LIKE 'open-jobs:%' AND j.fit_score >= ?)
           OR
           (j.source LIKE 'open-jobs:%' AND j.fit_score >= ?)
         )`
    )
    .all(MIN_FIT, MIN_FIT_OJ) as CandidateRow[];

  console.log(`Found ${candidates.length} candidate(s) with fit score >= ${MIN_FIT}.`);

  const provider = getBackgroundProvider();
  let tailored = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      await autoTailorApplication(db, c.application_id, provider);
      tailored++;
      console.log(`  tailored #${c.application_id} (${c.title} @ ${c.company}, fit ${c.fit_score})`);
    } catch (err) {
      errors.push(
        `#${c.application_id} (${c.title} @ ${c.company}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(`[${new Date().toISOString()}] done: tailored ${tailored}/${candidates.length}`);
  if (errors.length) {
    console.log(`  ${errors.length} error(s) (will retry next run):`);
    for (const e of errors) console.log(`   - ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
