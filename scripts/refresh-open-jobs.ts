/**
 * Daily delta refresh for the open-jobs dataset.
 *
 * Shells out to scripts/import-open-jobs.py (which handles pyarrow streaming),
 * then runs heuristic enrichment on all newly inserted rows that still have
 * fit_score = NULL.
 *
 * Run manually:  npm run refresh-open-jobs
 * Scheduled via: npm run install-schedule -- refresh-open-jobs
 *
 * Requires OPEN_JOBS_PARQUET_URL in .env.local (or the default upstream URL
 * will be used by the Python script).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — Python script will fall back to the default parquet URL
}

import { getDb } from "../src/lib/db";
import { enrichJobHeuristic } from "../src/lib/jobs/heuristic";
import type { NormalizedJob } from "../src/lib/jobs/types";
import type { ResumeData } from "../src/lib/resume";

const projectDir = process.cwd();
const pythonScript = path.join(projectDir, "scripts", "import-open-jobs.py");
const dbPath = path.join(projectDir, "data", "app.db");

// Prefer the dedicated venv (has pyarrow + fsspec + aiohttp); fall back to python3.
const venvPython = path.join(projectDir, ".venv-openjobs", "bin", "python");
const PYTHON = fs.existsSync(venvPython) ? venvPython : "python3";

async function main() {
  const started = new Date().toISOString();
  console.log(`[${started}] refresh-open-jobs starting…`);

  // ── Step 0 (optional): refresh the local parquet from the daily snapshot ──
  // The dataset is a daily-overwritten snapshot with no delta API, so a fresh
  // bulk pull means re-downloading. Set OPEN_JOBS_DOWNLOAD_URL to have the run
  // download (resumable, self-healing) into OPEN_JOBS_PARQUET_URL first. Meant
  // for a WEEKLY schedule — re-downloading ~20 GB daily is wasteful (the light
  // sources in refresh-feed already keep the feed fresh day to day).
  const downloadUrl = process.env.OPEN_JOBS_DOWNLOAD_URL || "";
  const localParquet = process.env.OPEN_JOBS_PARQUET_URL || "open-jobs.parquet";
  if (downloadUrl) {
    const dlScript = path.join(projectDir, "scripts", "download-open-jobs.sh");
    console.log(`[refresh-open-jobs] refreshing local parquet from ${downloadUrl}…`);
    try {
      execSync(`bash "${dlScript}" "${downloadUrl}" "${localParquet}"`, { stdio: "inherit" });
    } catch (err) {
      console.error("[refresh-open-jobs] download failed; importing existing local parquet:", err);
    }
  }

  // ── Step 1: Run Python import (scans parquet, inserts delta) ─────────────
  const parquetUrl = process.env.OPEN_JOBS_PARQUET_URL || "";
  const parquetArg = parquetUrl ? `--parquet "${parquetUrl}"` : "";

  console.log(`[refresh-open-jobs] running Python import (${PYTHON})…`);
  try {
    execSync(
      `"${PYTHON}" "${pythonScript}" ${parquetArg} --db "${dbPath}"`,
      { stdio: "inherit" }
    );
  } catch (err) {
    console.error("[refresh-open-jobs] Python import failed:", err);
    process.exit(1);
  }

  // ── Step 2: Heuristic-enrich newly inserted rows ─────────────────────────
  const db = getDb();

  const masterRow = db
    .prepare("SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1")
    .get() as { content_json: string } | undefined;
  const resume: ResumeData | null = masterRow
    ? (JSON.parse(masterRow.content_json) as ResumeData)
    : null;

  if (!resume) {
    console.log("[refresh-open-jobs] no master resume found — skipping fit scoring. Upload a resume first.");
    return;
  }

  interface RawJob {
    id: number; source: string; company: string; title: string;
    location: string | null; remote_type: string | null;
    posted_date: string | null; jd_text: string | null;
    url: string | null; salary_range: string | null;
  }

  const unenriched = db
    .prepare(
      `SELECT id, source, company, title, location, remote_type,
              posted_date, jd_text, url, salary_range
       FROM jobs
       WHERE fit_score IS NULL
         AND source LIKE 'open-jobs:%'`
    )
    .all() as RawJob[];

  console.log(`[refresh-open-jobs] enriching ${unenriched.length} unscored open-jobs row(s)…`);

  const update = db.prepare(
    `UPDATE jobs
     SET sponsorship_tag = ?, seniority_tag = ?, min_years = ?,
         fit_score = ?, fit_summary = ?, enriched_at = datetime('now')
     WHERE id = ?`
  );

  let enriched = 0;
  for (const row of unenriched) {
    const job: NormalizedJob = {
      source: row.source,
      company: row.company,
      title: row.title,
      location: row.location,
      remoteType: (row.remote_type as NormalizedJob["remoteType"]) ?? "unknown",
      postedDate: row.posted_date,
      jdText: row.jd_text,
      url: row.url,
      salaryRange: row.salary_range,
    };
    const e = enrichJobHeuristic(job, resume);
    // Only overwrite sponsorship/seniority/minYears if the Python importer
    // left them unset (the parquet values are often more accurate).
    update.run(
      e.sponsorshipTag,
      e.seniorityTag,
      e.minYears,
      e.fitScore,
      // Prefer the "Open-jobs summary:" already set by the Python importer;
      // fall back to the heuristic summary only if none was set.
      e.fitSummary,
      row.id
    );
    enriched++;
  }

  console.log(
    `[${new Date().toISOString()}] refresh-open-jobs done: enriched ${enriched} row(s)`
  );

  // ── Step 3 (optional): push the refreshed DB to Fly ─────────────────────
  // Off by default. Set OPEN_JOBS_PUSH_TO_FLY=1 (e.g. in the scheduled job's
  // environment) to snapshot the DB and ship it to the live machine.
  if (process.env.OPEN_JOBS_PUSH_TO_FLY === "1") {
    pushToFly();
  } else {
    console.log(
      "[refresh-open-jobs] OPEN_JOBS_PUSH_TO_FLY not set — DB updated locally only. " +
        "To deploy: snapshot + `fly ssh sftp put` + machine restart (see HANDOFF Common ops)."
    );
  }
}

/** Resolve the flyctl binary path (local ~/.fly/bin or on PATH in CI). */
function resolveFlyctl(): string {
  const home = process.env.HOME || "";
  const local = path.join(home, ".fly", "bin", "flyctl");
  return fs.existsSync(local) ? local : "flyctl";
}

/**
 * Snapshot the local DB and ship it to the live Fly machine, then restart.
 * Uses the safe temp-swap pattern (upload to import.db → mv over app.db → clear
 * wal/shm) so a dropped upload never corrupts the live DB, and resolves the
 * machine ID explicitly (required when not running interactively, e.g. in CI).
 */
function pushToFly() {
  const app = process.env.FLY_APP || "job-hunt-copilot";
  const flyctl = resolveFlyctl();
  const snapshot = "/tmp/app.db";

  console.log(`[refresh-open-jobs] pushing DB to Fly app "${app}"…`);
  try {
    execSync(`/usr/bin/sqlite3 "${dbPath}" ".backup ${snapshot}"`, { stdio: "inherit" });
    // Upload to a temp path, then atomically swap over app.db + clear wal/shm.
    execSync(`"${flyctl}" ssh sftp put "${snapshot}" /app/data/import.db --app ${app}`, { stdio: "inherit" });
    execSync(
      `"${flyctl}" ssh console --app ${app} -C "sh -c 'mv /app/data/import.db /app/data/app.db && rm -f /app/data/app.db-wal /app/data/app.db-shm'"`,
      { stdio: "inherit" }
    );
    // `machine restart` needs an explicit ID when non-interactive — look it up.
    const listed = execSync(`"${flyctl}" machines list --app ${app} --json`, { encoding: "utf8" });
    const machines = JSON.parse(listed) as Array<{ id: string }>;
    const machineId = machines[0]?.id;
    if (!machineId) throw new Error("no Fly machine found to restart");
    execSync(`"${flyctl}" machine restart ${machineId} --app ${app}`, { stdio: "inherit" });
    console.log(`[refresh-open-jobs] Fly push complete (restarted ${machineId}).`);
  } catch (err) {
    console.error("[refresh-open-jobs] Fly push failed:", err);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
