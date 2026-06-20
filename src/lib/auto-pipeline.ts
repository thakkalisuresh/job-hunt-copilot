import Database from "better-sqlite3";
import { chatComplete, completeJson, parseJson, ChatMessage } from "./llm";
import { LlmProvider } from "./providers/types";
import { ResumeData, EMPTY_RESUME } from "./resume";
import { ProfileData, EMPTY_PROFILE } from "./profile";
import {
  SYSTEM_PROMPT,
  diagnoserPrompt,
  recruiterPrompt,
  rewriterPrompt,
  interviewPrompt,
  RewriterResult,
} from "./pipeline";
import { outreachPrompt, followupPrompt, OutreachDraft } from "./outreach";
import { sanitizeDeep, reviewWritingStyle } from "./style-guide";
import { correctResumeGrammar, correctGrammar } from "./language-tool";

/**
 * Shared core for the resume-tailoring pipeline and outreach generation, used
 * by both the interactive Lab routes and unattended background jobs
 * (auto-tailor on save, interview-prep on "interview_requested"). Errors
 * carry an HTTP status so interactive callers can map them directly.
 */
export class PipelineStepError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApplicationRow {
  id: number;
  job_id: number;
  status: string;
  resume_version_id: number | null;
  conversation_json: string | null;
  updated_at: string;
}

interface JobRow {
  id: number;
  company: string;
  title: string;
  jd_text: string | null;
}

interface ResumeRow {
  id: number;
  content_json: string;
}

export type RunnablePipelineStep = "diagnose" | "keywords" | "rewrite" | "interview";

function getApplication(db: Database.Database, applicationId: number): ApplicationRow {
  const application = db
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(applicationId) as ApplicationRow | undefined;
  if (!application) {
    throw new PipelineStepError("Application not found", 404);
  }
  return application;
}

function getJob(db: Database.Database, jobId: number): JobRow {
  const job = db
    .prepare("SELECT id, company, title, jd_text FROM jobs WHERE id = ?")
    .get(jobId) as JobRow | undefined;
  if (!job) {
    throw new PipelineStepError("Job not found", 404);
  }
  if (!job.jd_text) {
    throw new PipelineStepError(
      "This job has no job description text to tailor against",
      400
    );
  }
  return job;
}

function getResume(db: Database.Database, application: ApplicationRow): ResumeData {
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
    throw new PipelineStepError(
      "Upload a master resume in Setup before running the Resume Lab",
      400
    );
  }
  return { ...EMPTY_RESUME, ...JSON.parse(resumeRow.content_json) };
}

function getProfile(db: Database.Database): ProfileData {
  const profileRow = db.prepare("SELECT data_json FROM profile WHERE id = 1").get() as
    | { data_json: string }
    | undefined;
  return profileRow ? { ...EMPTY_PROFILE, ...JSON.parse(profileRow.data_json) } : EMPTY_PROFILE;
}

/**
 * Run one diagnose/keywords/rewrite/interview pipeline step, appending to the
 * application's shared conversation and persisting the result, exactly as the
 * interactive Resume Lab does. For "rewrite", also runs the writing-style
 * review, grammar pass, and em-dash backstop, and stores a new tailored
 * resume version.
 */
export async function runPipelineStep(
  db: Database.Database,
  applicationId: number,
  step: RunnablePipelineStep,
  provider?: LlmProvider
): Promise<{ result: unknown; resumeVersionId: number | null }> {
  const application = getApplication(db, applicationId);
  const job = getJob(db, application.job_id);
  const resume = getResume(db, application);

  const conversation: ChatMessage[] = application.conversation_json
    ? JSON.parse(application.conversation_json)
    : [];

  let prompt: string;
  switch (step) {
    case "diagnose":
      prompt = diagnoserPrompt(resume, job.jd_text!);
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
  }

  conversation.push({ role: "user", content: prompt });

  let responseText: string;
  try {
    responseText = await chatComplete(conversation, SYSTEM_PROMPT, provider);
  } catch (err) {
    throw new PipelineStepError(
      err instanceof Error ? err.message : "LLM request failed",
      500
    );
  }

  conversation.push({ role: "assistant", content: responseText });

  let result: unknown;
  try {
    result = parseJson(responseText);
  } catch {
    throw new PipelineStepError(
      "The model returned a response that could not be parsed as JSON",
      502
    );
  }

  if (step === "rewrite") {
    result = await reviewWritingStyle(
      "tailored resume (summaryOfChanges, bulletDiffs, tailoredResume)",
      result,
      provider
    );
    const rewriteResult = result as RewriterResult;
    rewriteResult.tailoredResume = await correctResumeGrammar(rewriteResult.tailoredResume);
    result = sanitizeDeep(rewriteResult);
  }

  db.prepare(
    "UPDATE applications SET conversation_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(conversation), applicationId);

  db.prepare(
    "INSERT INTO pipeline_runs (application_id, step, output_json) VALUES (?, ?, ?)"
  ).run(applicationId, step, JSON.stringify(result));

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
    ).run(newResumeVersionId, applicationId);
  }

  if (application.status === "saved") {
    db.prepare(
      "UPDATE applications SET status = 'tailoring', updated_at = datetime('now') WHERE id = ?"
    ).run(applicationId);
  }

  return { result, resumeVersionId: newResumeVersionId };
}

/** Generate (and persist) a cold-outreach draft for an application, same as the Lab's outreach panel. */
export async function generateOutreachDraft(
  db: Database.Database,
  applicationId: number,
  provider?: LlmProvider
): Promise<OutreachDraft> {
  const application = getApplication(db, applicationId);
  const job = getJob(db, application.job_id);
  const resume = getResume(db, application);
  const profile = getProfile(db);

  let draft = await completeJson<OutreachDraft>(
    outreachPrompt(resume, job.jd_text!, job.company, job.title, profile),
    undefined,
    provider
  );
  draft = await reviewWritingStyle("outreach email (subject + body)", draft, provider);
  draft.body = await correctGrammar(draft.body, [resume.contact?.name, job.company].filter(
    (s): s is string => Boolean(s)
  ));
  draft = sanitizeDeep(draft);

  db.prepare(
    "UPDATE applications SET outreach_draft = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(draft), applicationId);

  return draft;
}

/** Generate (and persist) a follow-up nudge email for an application that's had no reply in a while. */
export async function generateFollowupDraft(
  db: Database.Database,
  applicationId: number,
  daysSinceApplied: number,
  provider?: LlmProvider
): Promise<OutreachDraft> {
  const application = getApplication(db, applicationId);
  const job = getJob(db, application.job_id);
  const resume = getResume(db, application);
  const profile = getProfile(db);

  let draft = await completeJson<OutreachDraft>(
    followupPrompt(resume, job.jd_text!, job.company, job.title, profile, daysSinceApplied),
    undefined,
    provider
  );
  draft = await reviewWritingStyle("follow-up email (subject + body)", draft, provider);
  draft.body = await correctGrammar(draft.body, [resume.contact?.name, job.company].filter(
    (s): s is string => Boolean(s)
  ));
  draft = sanitizeDeep(draft);

  db.prepare(
    "UPDATE applications SET outreach_draft = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(draft), applicationId);

  return draft;
}

/**
 * Run the full Diagnose -> Keywords -> Rewrite -> Outreach sequence for an
 * application, e.g. right after a job is saved to the tracker. Idempotent
 * gate (resume_version_id already set) is the caller's responsibility so a
 * background job can safely retry.
 */
export async function autoTailorApplication(
  db: Database.Database,
  applicationId: number,
  provider?: LlmProvider
): Promise<void> {
  const hasRun = (step: RunnablePipelineStep) =>
    Boolean(
      db
        .prepare("SELECT 1 FROM pipeline_runs WHERE application_id = ? AND step = ?")
        .get(applicationId, step)
    );

  // Skip steps a previous (failed) attempt already completed, so a retry
  // after e.g. a rewrite failure doesn't redo diagnose/keywords and bloat
  // the shared conversation with duplicates.
  if (!hasRun("diagnose")) await runPipelineStep(db, applicationId, "diagnose", provider);
  if (!hasRun("keywords")) await runPipelineStep(db, applicationId, "keywords", provider);
  await runPipelineStep(db, applicationId, "rewrite", provider);
  await generateOutreachDraft(db, applicationId, provider);
}

/**
 * Run the mock-interview-prep step for an application, e.g. as soon as email
 * triage detects "interview_requested". Skips silently (returns false) if the
 * application hasn't been tailored yet or interview prep already ran, so this
 * is safe to call speculatively from multiple triage paths.
 */
export async function triggerInterviewPrep(
  db: Database.Database,
  applicationId: number,
  provider?: LlmProvider
): Promise<boolean> {
  const application = db
    .prepare("SELECT * FROM applications WHERE id = ?")
    .get(applicationId) as ApplicationRow | undefined;
  if (!application || !application.resume_version_id || !application.conversation_json) {
    return false;
  }

  const existing = db
    .prepare("SELECT id FROM pipeline_runs WHERE application_id = ? AND step = 'interview'")
    .get(applicationId);
  if (existing) {
    return false;
  }

  await runPipelineStep(db, applicationId, "interview", provider);
  return true;
}
