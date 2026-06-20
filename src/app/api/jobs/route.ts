import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { EMPTY_RESUME, ResumeData } from "@/lib/resume";
import { measurePageFit } from "@/lib/resume-render";

export interface JobWithApplication {
  id: number;
  company: string;
  title: string;
  location: string | null;
  jd_text: string | null;
  url: string | null;
  created_at: string;
  application_id: number;
  status: string;
  resume_version_id: number | null;
  outreach_draft: string | null;
  recruiter_email: string | null;
  notes: string | null;
  updated_at: string;
  fit_score: number | null;
  /** Lines the tailored resume runs past page 1 (0 = fits, or no tailored version yet). */
  education_overflow_lines: number;
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT j.id, j.company, j.title, j.location, j.jd_text, j.url, j.created_at,
              j.fit_score,
              a.id as application_id, a.status, a.resume_version_id, a.outreach_draft,
              a.recruiter_email, a.notes, a.updated_at
       FROM jobs j
       JOIN applications a ON a.job_id = j.id
       ORDER BY j.created_at DESC`
    )
    .all() as JobWithApplication[];

  // Page-1 fit warning per card — only for applications that have a tailored
  // resume (the master is covered by its own dashboard banner). Cached by id.
  const getContent = db.prepare("SELECT content_json FROM resumes WHERE id = ?");
  const overflowCache = new Map<number, number>();
  for (const row of rows) {
    row.education_overflow_lines = 0;
    if (!row.resume_version_id) continue;
    let lines = overflowCache.get(row.resume_version_id);
    if (lines === undefined) {
      const r = getContent.get(row.resume_version_id) as { content_json: string } | undefined;
      const data: ResumeData = r
        ? { ...EMPTY_RESUME, ...JSON.parse(r.content_json) }
        : EMPTY_RESUME;
      lines = measurePageFit(data).linesOver;
      overflowCache.set(row.resume_version_id, lines);
    }
    row.education_overflow_lines = lines;
  }

  return NextResponse.json({ jobs: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { company, title, location, jdText, url } = body;

  if (!company || !title) {
    return NextResponse.json(
      { error: "company and title are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const jobInsert = db
    .prepare(
      `INSERT INTO jobs (source, company, title, location, jd_text, url)
       VALUES ('manual', ?, ?, ?, ?, ?)`
    )
    .run(company, title, location || null, jdText || null, url || null);

  const jobId = jobInsert.lastInsertRowid;

  const appInsert = db
    .prepare(`INSERT INTO applications (job_id, status) VALUES (?, 'saved')`)
    .run(jobId);

  return NextResponse.json({
    job: { id: jobId, company, title, location, jdText, url },
    application: { id: appInsert.lastInsertRowid, status: "saved" },
  });
}
