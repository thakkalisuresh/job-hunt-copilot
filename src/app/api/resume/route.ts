import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractTextFromFile, structureResume, ResumeData } from "@/lib/resume";
import { measurePageFit } from "@/lib/resume-render";
import { rescoreAllJobs } from "@/lib/jobs/rescore";

interface ResumeRow {
  id: number;
  content_json: string;
  raw_text: string | null;
  created_at: string;
}

export async function GET() {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, content_json, raw_text, created_at FROM resumes WHERE is_master = 1 ORDER BY created_at DESC LIMIT 1"
    )
    .get() as ResumeRow | undefined;

  if (!row) {
    return NextResponse.json({ resume: null });
  }

  const data = JSON.parse(row.content_json) as ResumeData;
  return NextResponse.json({
    resume: {
      id: row.id,
      data,
      rawText: row.raw_text,
      createdAt: row.created_at,
      // Does Work Experience + Education fit on page 1 of the apply-ready PDF?
      fit: measurePageFit(data),
    },
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  let rawText: string;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    rawText = await extractTextFromFile(buffer, file.type);
  } else {
    const body = await request.json();
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "No resume text provided" }, { status: 400 });
    }
    rawText = body.text;
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "Could not extract any text from the resume" },
      { status: 400 }
    );
  }

  let structured: ResumeData;
  try {
    structured = await structureResume(rawText);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse resume" },
      { status: 500 }
    );
  }

  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO resumes (job_id, is_master, content_json, raw_text) VALUES (NULL, 1, ?, ?)"
  );
  const result = insert.run(JSON.stringify(structured), rawText);
  db.prepare("UPDATE resumes SET is_master = 0 WHERE id != ? AND job_id IS NULL").run(
    result.lastInsertRowid
  );

  // Re-score the whole feed against the new master resume (free heuristic, instant).
  let rescored = 0;
  try {
    rescored = rescoreAllJobs(db, structured);
  } catch (err) {
    console.error("[resume] rescore after master change failed:", err);
  }

  return NextResponse.json({
    resume: { id: result.lastInsertRowid, data: structured, rawText },
    rescored,
  });
}
