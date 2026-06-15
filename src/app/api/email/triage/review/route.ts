import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export interface ReviewItem {
  id: number;
  gmailMessageId: string;
  receivedAt: string | null;
  fromAddress: string | null;
  subject: string | null;
  category: string;
  confidence: string;
  reason: string | null;
  applicationId: number | null;
  company: string | null;
  title: string | null;
  matchScore: number | null;
  suggestedStatus: string | null;
  createdAt: string;
}

/**
 * Review queue (BACKLOG feature A, ambiguous half): triage results that weren't
 * confident enough to auto-apply, but did suggest a status change. The dashboard
 * shows these for one-tap confirm/dismiss.
 */
export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.id, t.gmail_message_id, t.received_at, t.from_address, t.subject,
              t.category, t.confidence, t.reason, t.application_id, t.match_score,
              t.suggested_status, t.created_at,
              j.company, j.title
       FROM email_triage_log t
       LEFT JOIN applications a ON a.id = t.application_id
       LEFT JOIN jobs j ON j.id = a.job_id
       WHERE t.applied = 0 AND t.dismissed = 0 AND t.suggested_status IS NOT NULL
       ORDER BY t.id DESC`
    )
    .all() as {
    id: number;
    gmail_message_id: string;
    received_at: string | null;
    from_address: string | null;
    subject: string | null;
    category: string;
    confidence: string;
    reason: string | null;
    application_id: number | null;
    match_score: number | null;
    suggested_status: string | null;
    created_at: string;
    company: string | null;
    title: string | null;
  }[];

  const items: ReviewItem[] = rows.map((r) => ({
    id: r.id,
    gmailMessageId: r.gmail_message_id,
    receivedAt: r.received_at,
    fromAddress: r.from_address,
    subject: r.subject,
    category: r.category,
    confidence: r.confidence,
    reason: r.reason,
    applicationId: r.application_id,
    company: r.company,
    title: r.title,
    matchScore: r.match_score,
    suggestedStatus: r.suggested_status,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ items });
}
