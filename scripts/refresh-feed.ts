/**
 * Standalone Job Feed refresh — pulls from all enabled sources and writes to the
 * shared SQLite DB, independent of the Next.js dev server. Used both manually
 * (`npm run refresh-feed`) and on a schedule (see scripts/install-schedule.ts).
 */
import { refreshFeed } from "../src/lib/jobs/refresh";

// Load .env.local so API keys are available when run outside Next.js.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — sources still work; enrichment is skipped without an LLM key
}

async function main() {
  const started = new Date().toISOString();
  console.log(`[${started}] refresh-feed starting…`);
  const summary = await refreshFeed();
  console.log(
    `[${new Date().toISOString()}] done: fetched ${summary.fetched}, added ${summary.inserted}, enriched ${summary.enriched}`
  );
  if (summary.errors.length) {
    console.log(`  ${summary.errors.length} error(s):`);
    for (const e of summary.errors) console.log(`   - ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
