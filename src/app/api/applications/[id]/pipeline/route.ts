import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { chatComplete, ChatMessage, parseJson } from "@/lib/llm";
import {
  SYSTEM_PROMPT,
  interviewFeedbackPrompt,
  InterviewResult,
} from "@/lib/pipeline";
import { runPipelineStep, PipelineStepError, RunnablePipelineStep } from "@/lib/auto-pipeline";

interface ApplicationRow {
  id: number;
  job_id: number;
  status: string;
  resume_version_id: number | null;
  conversation_json: string | null;
}

interface PipelineRunRow {
  id: number;
  step: string;
  output_json: string;
  created_at: string;
}

const RUNNABLE_STEPS: RunnablePipelineStep[] = ["diagnose", "keywords", "rewrite", "interview"];

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
  const applicationId = Number(id);
  const body = await request.json();
  const step = body.step as string;
  const db = getDb();

  if ((RUNNABLE_STEPS as string[]).includes(step)) {
    try {
      const { result, resumeVersionId } = await runPipelineStep(
        db,
        applicationId,
        step as RunnablePipelineStep
      );
      return NextResponse.json({ step, result, resumeVersionId });
    } catch (err) {
      if (err instanceof PipelineStepError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Pipeline step failed" },
        { status: 500 }
      );
    }
  }

  if (step === "interview-answer") {
    const application = db
      .prepare("SELECT * FROM applications WHERE id = ?")
      .get(applicationId) as ApplicationRow | undefined;

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const { questionIndex, answer } = body as {
      questionIndex: number;
      answer: string;
    };
    const interviewRun = db
      .prepare(
        "SELECT output_json FROM pipeline_runs WHERE application_id = ? AND step = 'interview' ORDER BY id DESC LIMIT 1"
      )
      .get(applicationId) as { output_json: string } | undefined;
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
    const prompt = interviewFeedbackPrompt(question.question, question.whatGoodLooksLike, answer);
    const runStep = `interview-answer-${questionIndex}`;

    const conversation: ChatMessage[] = application.conversation_json
      ? JSON.parse(application.conversation_json)
      : [];
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

    db.prepare(
      "UPDATE applications SET conversation_json = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(conversation), applicationId);

    db.prepare(
      "INSERT INTO pipeline_runs (application_id, step, output_json) VALUES (?, ?, ?)"
    ).run(applicationId, runStep, JSON.stringify(result));

    return NextResponse.json({ step: runStep, result, resumeVersionId: null });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
