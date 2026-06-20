import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { APPLICATION_STATUSES } from "@/lib/statuses";
import { getBackgroundProvider } from "@/lib/llm";
import { triggerInterviewPrep } from "@/lib/auto-pipeline";

export const runtime = "nodejs";

const VALID_STATUSES = APPLICATION_STATUSES.map((s) => s.key);

/**
 * Act on a review-queue row (BACKLOG feature A, ambiguous half).
 *
 * Body: { action: "confirm" | "dismiss" }
 *  - confirm: apply the suggested status to the matched application, mark applied.
 *  - dismiss: leave the tracker untouched, hide the row from the review queue.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, application_id, suggested_status, applied, dismissed FROM email_triage_log WHERE id = ?"
    )
    .get(id) as
    | {
        id: number;
        application_id: number | null;
        suggested_status: string | null;
        applied: number;
        dismissed: number;
      }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: "Review item not found" }, { status: 404 });
  }
  if (row.applied || row.dismissed) {
    return NextResponse.json({ error: "Already resolved" }, { status: 400 });
  }

  if (action === "confirm") {
    if (!row.application_id || !row.suggested_status) {
      return NextResponse.json(
        { error: "No matched application to apply this status to" },
        { status: 400 }
      );
    }
    if (!VALID_STATUSES.includes(row.suggested_status)) {
      return NextResponse.json({ error: "Invalid suggested status" }, { status: 400 });
    }
    db.prepare(
      "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(row.suggested_status, row.application_id);
    db.prepare("UPDATE email_triage_log SET applied = 1 WHERE id = ?").run(row.id);

    if (row.suggested_status === "interview_requested") {
      try {
        await triggerInterviewPrep(db, row.application_id, getBackgroundProvider());
      } catch {
        // Interview prep is best-effort; the status update above already succeeded.
      }
    }
  } else if (action === "dismiss") {
    db.prepare("UPDATE email_triage_log SET dismissed = 1 WHERE id = ?").run(row.id);
  } else {
    return NextResponse.json({ error: "action must be 'confirm' or 'dismiss'" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
