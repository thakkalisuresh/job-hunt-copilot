import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ResumeData, EMPTY_RESUME } from "@/lib/resume";
import { resumeToDocx, resumeToPdf } from "@/lib/resume-render";

export const runtime = "nodejs";

function safeName(resume: ResumeData): string {
  const base = (resume.contact?.name || "resume").replace(/[^a-z0-9]+/gi, "_");
  return base.replace(/^_+|_+$/g, "") || "resume";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Apply-ready = PDF, editable = DOCX. Those are the only formats we produce.
  const format = request.nextUrl.searchParams.get("format") || "pdf";

  const db = getDb();
  const row = db
    .prepare("SELECT content_json FROM resumes WHERE id = ?")
    .get(id) as { content_json: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  const resume: ResumeData = { ...EMPTY_RESUME, ...JSON.parse(row.content_json) };
  const name = safeName(resume);

  if (format === "docx") {
    const buffer = await resumeToDocx(resume);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}.docx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await resumeToPdf(resume);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
      },
    });
  }

  return NextResponse.json(
    { error: "Unsupported format. Use 'pdf' (apply-ready) or 'docx' (editable)." },
    { status: 400 }
  );
}
