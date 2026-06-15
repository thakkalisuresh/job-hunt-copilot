import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { completeJson } from "@/lib/llm";
import { ResumeData, EMPTY_RESUME } from "@/lib/resume";
import { ProfileData, EMPTY_PROFILE } from "@/lib/profile";
import { outreachPrompt, buildMailto, OutreachDraft } from "@/lib/outreach";
import { sanitizeDeep, reviewWritingStyle } from "@/lib/style-guide";

interface AppRow {
  id: number;
  job_id: number;
  resume_version_id: number | null;
  outreach_draft: string | null;
}

interface JobRow {
  company: string;
  title: string;
  jd_text: string | null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as
    | AppRow
    | undefined;
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const job = db
    .prepare("SELECT company, title, jd_text FROM jobs WHERE id = ?")
    .get(app.job_id) as JobRow | undefined;
  if (!job || !job.jd_text) {
    return NextResponse.json(
      { error: "This job has no description to base outreach on" },
      { status: 400 }
    );
  }

  let resumeRow = app.resume_version_id
    ? (db
        .prepare("SELECT content_json FROM resumes WHERE id = ?")
        .get(app.resume_version_id) as { content_json: string } | undefined)
    : undefined;
  if (!resumeRow) {
    resumeRow = db
      .prepare(
        "SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1"
      )
      .get() as { content_json: string } | undefined;
  }
  if (!resumeRow) {
    return NextResponse.json(
      { error: "Upload a master resume in Setup first" },
      { status: 400 }
    );
  }

  const resume: ResumeData = { ...EMPTY_RESUME, ...JSON.parse(resumeRow.content_json) };
  const profileRow = db.prepare("SELECT data_json FROM profile WHERE id = 1").get() as
    | { data_json: string }
    | undefined;
  const profile: ProfileData = profileRow
    ? { ...EMPTY_PROFILE, ...JSON.parse(profileRow.data_json) }
    : EMPTY_PROFILE;

  let draft: OutreachDraft;
  try {
    draft = await completeJson<OutreachDraft>(
      outreachPrompt(resume, job.jd_text, job.company, job.title, profile)
    );
    draft = sanitizeDeep(await reviewWritingStyle("outreach email (subject + body)", draft));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outreach generation failed" },
      { status: 500 }
    );
  }

  db.prepare(
    "UPDATE applications SET outreach_draft = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(draft), id);

  return NextResponse.json({ draft, mailto: buildMailto(draft) });
}
