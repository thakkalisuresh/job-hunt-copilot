import Database from "better-sqlite3";
import { ResumeData } from "../resume";
import { NormalizedJob, RemoteType } from "./types";
import { enrichJobHeuristic } from "./heuristic";
import { applySponsorOverride } from "./enrich";

interface JobRow {
  id: number;
  source: string | null;
  company: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  posted_date: string | null;
  jd_text: string | null;
  url: string | null;
  salary_range: string | null;
}

/**
 * Re-score EVERY job against the given resume using the free offline heuristic
 * (`enrichJobHeuristic`) — no LLM, no network, so it's instant and $0 and safe to
 * run synchronously in a request. Called when the master resume changes so the
 * whole feed re-ranks against the new resume.
 *
 * Returns the number of jobs re-scored.
 */
export function rescoreAllJobs(db: Database.Database, resume: ResumeData | null): number {
  const rows = db
    .prepare(
      `SELECT id, source, company, title, location, remote_type, posted_date, jd_text, url, salary_range
       FROM jobs`
    )
    .all() as JobRow[];

  const update = db.prepare(
    `UPDATE jobs SET sponsorship_tag = ?, seniority_tag = ?, min_years = ?,
       fit_score = ?, fit_summary = ?, enriched_at = datetime('now')
     WHERE id = ?`
  );

  const run = db.transaction((jobs: JobRow[]) => {
    for (const row of jobs) {
      const job: NormalizedJob = {
        source: row.source ?? "",
        company: row.company,
        title: row.title,
        location: row.location,
        remoteType: (row.remote_type as RemoteType) ?? "unknown",
        postedDate: row.posted_date,
        jdText: row.jd_text,
        url: row.url,
        salaryRange: row.salary_range,
      };
      const e = applySponsorOverride(enrichJobHeuristic(job, resume), job.company);
      update.run(e.sponsorshipTag, e.seniorityTag, e.minYears, e.fitScore, e.fitSummary, row.id);
    }
  });
  run(rows);
  return rows.length;
}
