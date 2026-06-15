import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hasLlmKey } from "@/lib/llm";
import {
  classifyEmail,
  matchApplication,
  categoryToStatus,
  isConfident,
  MatchableApplication,
} from "@/lib/email-triage";

export const runtime = "nodejs";

/**
 * Triage one job-related email against the tracker. Feed it a pasted email now,
 * or a Gmail connector / browser extension later. Auto-applies the status change
 * only when confident; otherwise returns a suggestion for the review queue.
 *
 * Body: { from, subject, body, apply?: boolean }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = {
    from: String(body.from || ""),
    subject: String(body.subject || ""),
    body: String(body.body || ""),
  };
  const apply = body.apply === true;

  if (!email.subject && !email.body) {
    return NextResponse.json({ error: "subject or body is required" }, { status: 400 });
  }
  if (!hasLlmKey()) {
    return NextResponse.json(
      { error: "No LLM key configured — set ANTHROPIC_API_KEY to classify emails." },
      { status: 400 }
    );
  }

  const db = getDb();
  const apps = db
    .prepare(
      `SELECT a.id, j.company, j.title
       FROM applications a JOIN jobs j ON j.id = a.job_id`
    )
    .all() as MatchableApplication[];

  const classification = await classifyEmail(email);
  const match = matchApplication(email, apps);
  const suggestedStatus = categoryToStatus(classification.category);
  const confident = isConfident(classification, match, suggestedStatus);

  let applied = false;
  if (apply && confident && match && suggestedStatus) {
    db.prepare(
      "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(suggestedStatus, match.applicationId);
    applied = true;
  }

  return NextResponse.json({
    classification,
    match,
    suggestedStatus,
    confident, // true → safe to auto-apply; false → send to the review queue
    applied,
  });
}
