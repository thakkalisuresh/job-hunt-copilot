import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { EMPTY_RESUME, ResumeData } from "@/lib/resume";
import { measurePageFit } from "@/lib/resume-render";
import { APPLICATION_STATUSES } from "@/lib/statuses";

const VALID_STATUSES = APPLICATION_STATUSES.map((s) => s.key);

interface ResumeRow {
  id: number;
  content_json: string;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const application = db
    .prepare(
      `SELECT a.*, j.company, j.title, j.location, j.jd_text, j.url
       FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ?`
    )
    .get(id) as
    | {
        id: number;
        job_id: number;
        status: string;
        resume_version_id: number | null;
        notes: string | null;
        outreach_draft: string | null;
        recruiter_email: string | null;
        company: string;
        title: string;
        location: string | null;
        jd_text: string | null;
        url: string | null;
      }
    | undefined;

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const masterResumeRow = db
    .prepare(
      "SELECT id, content_json, created_at FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1"
    )
    .get() as ResumeRow | undefined;

  let tailoredResumeRow: ResumeRow | undefined;
  if (application.resume_version_id) {
    tailoredResumeRow = db
      .prepare("SELECT id, content_json, created_at FROM resumes WHERE id = ?")
      .get(application.resume_version_id) as ResumeRow | undefined;
  }

  // Page-1 fit of the resume that would actually be exported here.
  const exported = tailoredResumeRow ?? masterResumeRow;
  const fit = exported
    ? measurePageFit({ ...EMPTY_RESUME, ...JSON.parse(exported.content_json) })
    : null;

  return NextResponse.json({
    application: {
      id: application.id,
      jobId: application.job_id,
      status: application.status,
      resumeVersionId: application.resume_version_id,
      notes: application.notes,
      outreachDraft: application.outreach_draft,
      recruiterEmail: application.recruiter_email,
      company: application.company,
      title: application.title,
      location: application.location,
      jdText: application.jd_text,
      url: application.url,
      fit,
    },
    masterResume: masterResumeRow
      ? {
          id: masterResumeRow.id,
          data: JSON.parse(masterResumeRow.content_json) as ResumeData,
          createdAt: masterResumeRow.created_at,
        }
      : null,
    tailoredResume: tailoredResumeRow
      ? {
          id: tailoredResumeRow.id,
          data: JSON.parse(tailoredResumeRow.content_json) as ResumeData,
          createdAt: tailoredResumeRow.created_at,
        }
      : null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    db.prepare(
      "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(body.status, id);
  }

  if (body.notes !== undefined) {
    db.prepare(
      "UPDATE applications SET notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(body.notes, id);
  }

  if (body.outreachDraft !== undefined) {
    db.prepare(
      "UPDATE applications SET outreach_draft = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(body.outreachDraft, id);
  }

  if (body.resumeVersionId !== undefined) {
    db.prepare(
      "UPDATE applications SET resume_version_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(body.resumeVersionId, id);
  }

  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  return NextResponse.json({ application: row });
}
