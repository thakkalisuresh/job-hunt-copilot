import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getBackgroundProvider } from "@/lib/llm";
import { autoTailorAndPrep } from "@/lib/auto-pipeline";

/**
 * Kick off the full tailoring pipeline for a freshly-saved application in the
 * background (no manual Lab clicks). Fire-and-forget: the save response returns
 * immediately while Diagnose → Keywords → Rewrite → Outreach → Interview-prep run
 * on the always-on server. Gated on an LLM key so it no-ops cleanly without one.
 */
function kickoffAutoTailor(db: ReturnType<typeof getDb>, applicationId: number) {
  const provider = getBackgroundProvider();
  if (!provider.hasKey()) return;
  void autoTailorAndPrep(db, applicationId, provider).catch((err) =>
    console.error(`[auto-tailor-on-save] application ${applicationId} failed:`, err)
  );
}

/** Create a tracker application for an existing job (e.g. saving one from the feed). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const jobId = Number(body.jobId);
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const db = getDb();
  const job = db.prepare("SELECT id FROM jobs WHERE id = ?").get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const existing = db
    .prepare("SELECT * FROM applications WHERE job_id = ?")
    .get(jobId) as { id: number; status: string } | undefined;
  if (existing) {
    return NextResponse.json({ application: existing, created: false });
  }

  const res = db
    .prepare("INSERT INTO applications (job_id, status) VALUES (?, 'saved')")
    .run(jobId);
  const applicationId = Number(res.lastInsertRowid);
  kickoffAutoTailor(db, applicationId);
  return NextResponse.json({
    application: { id: applicationId, status: "saved" },
    created: true,
  });
}
