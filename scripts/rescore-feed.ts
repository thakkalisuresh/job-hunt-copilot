/**
 * Re-score the entire job feed against the current master resume using the free
 * offline heuristic (no LLM / no API). Useful after changing the master resume.
 *
 *   npm run rescore
 */
import { getDb } from "../src/lib/db";
import { ResumeData } from "../src/lib/resume";
import { rescoreAllJobs } from "../src/lib/jobs/rescore";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — the heuristic needs no keys anyway
}

function main() {
  const db = getDb();
  const master = db
    .prepare("SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1")
    .get() as { content_json: string } | undefined;

  if (!master) {
    console.error("No master resume found — upload one first.");
    process.exit(1);
  }

  const resume = JSON.parse(master.content_json) as ResumeData;
  console.log("Re-scoring the feed against the current master resume…");
  const n = rescoreAllJobs(db, resume);
  console.log(`Done: re-scored ${n} job(s).`);
}

main();
