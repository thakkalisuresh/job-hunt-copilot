import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildMailto } from "@/lib/outreach";
import { generateOutreachDraft, PipelineStepError } from "@/lib/auto-pipeline";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  try {
    const draft = await generateOutreachDraft(db, Number(id));
    return NextResponse.json({ draft, mailto: buildMailto(draft) });
  } catch (err) {
    if (err instanceof PipelineStepError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outreach generation failed" },
      { status: 500 }
    );
  }
}
