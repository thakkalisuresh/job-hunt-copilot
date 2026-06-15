import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { chatComplete, ChatMessage, parseJson } from "@/lib/llm";
import { ResumeData, EMPTY_RESUME } from "@/lib/resume";
import {
  SYSTEM_PROMPT,
  diagnoserPrompt,
  recruiterPrompt,
  rewriterPrompt,
  interviewPrompt,
  interviewFeedbackPrompt,
  RewriterResult,
  InterviewResult,
} from "@/lib/pipeline";
import { sanitizeDeep, reviewWritingStyle } from "@/lib/style-guide";

interface ApplicationRow {
  id: number;
  job_id: number;
  status: string;
  resume_version_id: number | null;
  conversation_json: string | null;
}

interface JobRow {
  id: number;
  jd_text: string | null;
}

interface ResumeRow {
  id: number;
  content_json: string;
}

interface PipelineRunRow {
  id: number;
  step: string;
  output_json: string;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const application = db
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(id) as ApplicationRow | undefined;

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const runs = db
    .prepare(
      "SELECT id, step, output_json, created_at FROM pipeline_runs WHERE application_id = ? ORDER BY id ASC"
    )
    .all(id) as PipelineRunRow[];

  const conversation: ChatMessage[] = application.conversation_json
    ? JSON.parse(application.conversation_json)
    : [];

  return NextResponse.json({
    conversation,
    runs: runs.map((r) => ({
      id: r.id,
      step: r.step,
      output: JSON.parse(r.output_json),
      createdAt: r.created_at,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const step = body.step as string;
  const db = getDb();

  const application = db
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(id) as ApplicationRow | undefined;

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const job = db
    .prepare("SELECT id, jd_text FROM jobs WHERE id = ?")
    .get(application.job_id) as JobRow | undefined;

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!job.jd_text) {
    return NextResponse.json(
      { error: "This job has no job description text to tailor against" },
      { status: 400 }
    );
  }

  let resumeRow: ResumeRow | undefined;
  if (application.resume_version_id) {
    resumeRow = db
      .prepare("SELECT id, content_json FROM resumes WHERE id = ?")
      .get(application.resume_version_id) as ResumeRow | undefined;
  }
  if (!resumeRow) {
    resumeRow = db
      .prepare(
        "SELECT id, content_json FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1"
      )
      .get() as ResumeRow | undefined;
  }
  if (!resumeRow) {
    return NextResponse.json(
      { error: "Upload a master resume in Setup before running the Resume Lab" },
      { status: 400 }
    );
  }

  const resume: ResumeData = { ...EMPTY_RESUME, ...JSON.parse(resumeRow.content_json) };
  const conversation: ChatMessage[] = application.conversation_json
    ? JSON.parse(application.conversation_json)
    : [];

  let prompt: string;
  let runStep = step;

  switch (step) {
    case "diagnose":
      prompt = diagnoserPrompt(resume, job.jd_text);
      break;
    case "keywords":
      prompt = recruiterPrompt();
      break;
    case "rewrite":
      prompt = rewriterPrompt();
      break;
    case "interview":
      prompt = interviewPrompt();
      break;
    case "interview-answer": {
      const { questionIndex, answer } = body as {
        questionIndex: number;
        answer: string;
      };
      const interviewRun = db
        .prepare(
          "SELECT output_json FROM pipeline_runs WHERE application_id = ? AND step = 'interview' ORDER BY id DESC LIMIT 1"
        )
        .get(id) as { output_json: string } | undefined;
      if (!interviewRun) {
        return NextResponse.json(
          { error: "Run the mock interview step first" },
          { status: 400 }
        );
      }
      const interviewResult = JSON.parse(interviewRun.output_json) as InterviewResult;
      const question = interviewResult.questions[questionIndex];
      if (!question) {
        return NextResponse.json({ error: "Invalid question index" }, { status: 400 });
      }
      prompt = interviewFeedbackPrompt(question.question, question.whatGoodLooksLike, answer);
      runStep = `interview-answer-${questionIndex}`;
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  conversation.push({ role: "user", content: prompt });

  let responseText: string;
  try {
    responseText = await chatComplete(conversation, SYSTEM_PROMPT);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM request failed" },
      { status: 500 }
    );
  }

  conversation.push({ role: "assistant", content: responseText });

  let result: unknown;
  try {
    result = parseJson(responseText);
  } catch {
    return NextResponse.json(
      { error: "Claude returned a response that could not be parsed as JSON", raw: responseText },
      { status: 502 }
    );
  }

  // Second-pass style review + defense-in-depth em-dash stripping, regardless
  // of how well the model followed STYLE_RULES the first time.
  if (runStep === "rewrite") {
    result = await reviewWritingStyle("tailored resume (summaryOfChanges, bulletDiffs, tailoredResume)", result);
    result = sanitizeDeep(result);
  }

  db.prepare(
    "UPDATE applications SET conversation_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(conversation), id);

  db.prepare(
    "INSERT INTO pipeline_runs (application_id, step, output_json) VALUES (?, ?, ?)"
  ).run(id, runStep, JSON.stringify(result));

  let newResumeVersionId: number | null = null;
  if (step === "rewrite") {
    const rewriteResult = result as RewriterResult;
    const insert = db
      .prepare(
        "INSERT INTO resumes (job_id, is_master, content_json, raw_text) VALUES (?, 0, ?, NULL)"
      )
      .run(application.job_id, JSON.stringify(rewriteResult.tailoredResume));
    newResumeVersionId = Number(insert.lastInsertRowid);
    db.prepare(
      "UPDATE applications SET resume_version_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newResumeVersionId, id);
  }

  if (application.status === "saved") {
    db.prepare(
      "UPDATE applications SET status = 'tailoring', updated_at = datetime('now') WHERE id = ?"
    ).run(id);
  }

  return NextResponse.json({
    step: runStep,
    result,
    resumeVersionId: newResumeVersionId,
  });
}
