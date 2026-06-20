import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface FeedJob {
  id: number;
  source: string | null;
  company: string;
  title: string;
  location: string | null;
  remote_type: string | null;
  posted_date: string | null;
  url: string | null;
  salary_range: string | null;
  sponsorship_tag: string | null;
  seniority_tag: string | null;
  min_years: number | null;
  fit_score: number | null;
  fit_summary: string | null;
  application_id: number | null;
  status: string | null;
  // open-jobs enriched fields (null for non-open-jobs rows)
  industry: string | null;
  job_level: string | null;
  job_function: string | null;
  skills_json: string | null;
  company_summary: string | null;
  embed_score: number | null;
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const sp = request.nextUrl.searchParams;

  const where: string[] = [];
  const args: unknown[] = [];

  const postedWithin = sp.get("postedWithin"); // days
  if (postedWithin) {
    where.push("j.posted_date >= datetime('now', ?)");
    args.push(`-${Number(postedWithin)} days`);
  }
  const remoteType = sp.get("remoteType");
  if (remoteType) {
    where.push("j.remote_type = ?");
    args.push(remoteType);
  }
  const seniority = sp.get("seniority");
  if (seniority) {
    where.push("j.seniority_tag = ?");
    args.push(seniority);
  }
  const sponsorship = sp.get("sponsorship");
  if (sponsorship) {
    where.push("j.sponsorship_tag = ?");
    args.push(sponsorship);
  }
  const source = sp.get("source");
  if (source) {
    where.push("j.source LIKE ?");
    args.push(`${source}%`);
  }
  const company = sp.get("company");
  if (company) {
    where.push("j.company LIKE ?");
    args.push(`%${company}%`);
  }
  const minFit = sp.get("minFit");
  if (minFit) {
    where.push("j.fit_score >= ?");
    args.push(Number(minFit));
  }
  const maxYears = sp.get("maxYears");
  if (maxYears) {
    where.push("(j.min_years IS NULL OR j.min_years <= ?)");
    args.push(Number(maxYears));
  }

  const jobLevel = sp.get("jobLevel");
  if (jobLevel) {
    where.push("j.job_level = ?");
    args.push(jobLevel);
  }
  const jobFunction = sp.get("jobFunction");
  if (jobFunction) {
    where.push("j.job_function = ?");
    args.push(jobFunction);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT j.id, j.source, j.company, j.title, j.location, j.remote_type,
              j.posted_date, j.url, j.salary_range, j.sponsorship_tag,
              j.seniority_tag, j.min_years, j.fit_score, j.fit_summary,
              j.industry, j.job_level, j.job_function, j.skills_json, j.company_summary,
              j.embed_score,
              a.id as application_id, a.status
       FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id
       ${clause}
       ORDER BY (j.fit_score IS NULL), j.fit_score DESC, j.posted_date DESC
       LIMIT 200`
    )
    .all(...args) as FeedJob[];

  return NextResponse.json({ jobs: rows });
}
