import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildMailto } from "@/lib/outreach";
import { generateFollowupDraft, PipelineStepError } from "@/lib/auto-pipeline";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const application = db
    .prepare(
      "SELECT updated_at, CAST((julianday('now') - julianday(updated_at)) AS INTEGER) as days_since_update FROM applications WHERE id = ?"
    )
    .get(id) as { updated_at: string; days_since_update: number } | undefined;

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  try {
    const draft = await generateFollowupDraft(
      db,
      Number(id),
      Math.max(application.days_since_update, 1)
    );
    return NextResponse.json({ draft, mailto: buildMailto(draft) });
  } catch (err) {
    if (err instanceof PipelineStepError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Follow-up generation failed" },
      { status: 500 }
    );
  }
}
