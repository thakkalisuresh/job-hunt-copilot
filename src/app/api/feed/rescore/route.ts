import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ResumeData } from "@/lib/resume";
import { rescoreAllJobs } from "@/lib/jobs/rescore";

/** Re-score the whole feed against the current master resume (free heuristic). */
export async function POST() {
  const db = getDb();
  const master = db
    .prepare("SELECT content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1")
    .get() as { content_json: string } | undefined;

  if (!master) {
    return NextResponse.json(
      { error: "No master resume — upload one first." },
      { status: 400 }
    );
  }

  const resume = JSON.parse(master.content_json) as ResumeData;
  const rescored = rescoreAllJobs(db, resume);
  return NextResponse.json({ rescored });
}
