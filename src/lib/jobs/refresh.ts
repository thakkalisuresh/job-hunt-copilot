import { getDb } from "../db";
import { ResumeData } from "../resume";
import { NormalizedJob } from "./types";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchRemoteOk } from "./remoteok";
import { fetchHackerNews } from "./hackernews";
import { fetchApify } from "./apify";
import { enrichJob } from "./enrich";
import { hasLlmKey } from "../llm";
import {
  GREENHOUSE_BOARDS,
  LEVER_COMPANIES,
  ENABLE_REMOTEOK,
  ENABLE_HACKERNEWS,
  APIFY_ACTORS,
  FEED_REFRESH_LIMIT,
} from "./sources";

export interface RefreshSummary {
  fetched: number;
  inserted: number;
  enriched: number;
  errors: string[];
}

async function gatherAll(): Promise<{ jobs: NormalizedJob[]; errors: string[] }> {
  const tasks: { label: string; run: () => Promise<NormalizedJob[]> }[] = [];

  for (const board of GREENHOUSE_BOARDS) {
    tasks.push({ label: `greenhouse:${board}`, run: () => fetchGreenhouse(board) });
  }
  for (const company of LEVER_COMPANIES) {
    tasks.push({ label: `lever:${company}`, run: () => fetchLever(company) });
  }
  if (ENABLE_REMOTEOK) tasks.push({ label: "remoteok", run: () => fetchRemoteOk() });
  if (ENABLE_HACKERNEWS) tasks.push({ label: "hackernews", run: () => fetchHackerNews() });
  if (process.env.APIFY_TOKEN) {
    APIFY_ACTORS.forEach((cfg, i) =>
      tasks.push({ label: `apify:${cfg.actorId}#${i}`, run: () => fetchApify(cfg) })
    );
  }

  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") jobs.push(...r.value);
    else errors.push(`${tasks[i].label}: ${r.reason?.message || r.reason}`);
  });
  return { jobs, errors };
}

function sortAndCap(jobs: NormalizedJob[], limit: number): NormalizedJob[] {
  return [...jobs]
    .sort((a, b) => {
      const ta = a.postedDate ? Date.parse(a.postedDate) : 0;
      const tb = b.postedDate ? Date.parse(b.postedDate) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Pull from all enabled sources, store new postings, and enrich them. */
export async function refreshFeed(): Promise<RefreshSummary> {
  const db = getDb();
  const { jobs, errors } = await gatherAll();
  const capped = sortAndCap(jobs, FEED_REFRESH_LIMIT);

  const findByUrl = db.prepare("SELECT id FROM jobs WHERE url = ?");
  const insert = db.prepare(
    `INSERT INTO jobs (source, company, title, location, remote_type, posted_date, jd_text, url, salary_range)
     VALUES (@source, @company, @title, @location, @remoteType, @postedDate, @jdText, @url, @salaryRange)`
  );

  const insertedIds: number[] = [];
  for (const job of capped) {
    if (job.url) {
      const existing = findByUrl.get(job.url) as { id: number } | undefined;
      if (existing) continue;
    }
    const res = insert.run({
      source: job.source,
      company: job.company,
      title: job.title,
      location: job.location,
      remoteType: job.remoteType,
      postedDate: job.postedDate,
      jdText: job.jdText,
      url: job.url,
      salaryRange: job.salaryRange,
    });
    insertedIds.push(Number(res.lastInsertRowid));
  }

  let enriched = 0;
  if (hasLlmKey() && insertedIds.length > 0) {
    const masterRow = db
      .prepare(
        "SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1"
      )
      .get() as { content_json: string } | undefined;
    const resume: ResumeData | null = masterRow
      ? (JSON.parse(masterRow.content_json) as ResumeData)
      : null;

    const update = db.prepare(
      `UPDATE jobs SET sponsorship_tag = ?, seniority_tag = ?, min_years = ?,
        fit_score = ?, fit_summary = ?, enriched_at = datetime('now') WHERE id = ?`
    );

    const toEnrich = insertedIds
      .map((id) => ({
        id,
        row: db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as {
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
        },
      }))
      .filter((j) => j.row.jd_text);

    await mapWithConcurrency(toEnrich, 4, async ({ id, row }) => {
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
        update.run(
          e.sponsorshipTag,
          e.seniorityTag,
          e.minYears,
          e.fitScore,
          e.fitSummary,
          id
        );
        enriched++;
      } catch (err) {
        errors.push(`enrich job ${id}: ${err instanceof Error ? err.message : err}`);
      }
    });
  }

  return { fetched: jobs.length, inserted: insertedIds.length, enriched, errors };
}
