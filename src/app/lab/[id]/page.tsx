"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  DiagnoserResult,
  RecruiterResult,
  RewriterResult,
  InterviewResult,
  InterviewFeedback,
} from "@/lib/pipeline";
import { OutreachDraft, buildMailto, buildLinkedInSearch } from "@/lib/outreach";
import { isInterviewStage } from "@/lib/statuses";

interface ApplicationDetail {
  id: number;
  jobId: number;
  status: string;
  resumeVersionId: number | null;
  company: string;
  title: string;
  location: string | null;
  jdText: string | null;
  url: string | null;
  outreachDraft: string | null;
  recruiterEmail: string | null;
  fit: { fitsOnePage: boolean; linesOver: number } | null;
}

interface PipelineRun {
  id: number;
  step: string;
  output: unknown;
  createdAt: string;
}

const STEPS: { key: string; label: string; description: string }[] = [
  {
    key: "diagnose",
    label: "1. ATS Diagnoser",
    description: "Check the resume for ATS parsing issues and gaps vs this job.",
  },
  {
    key: "keywords",
    label: "2. Recruiter keyword gap",
    description: "Find keywords from the JD that are missing from the resume.",
  },
  {
    key: "rewrite",
    label: "3. XYZ Rewriter",
    description: "Rewrite bullets in XYZ format and create a tailored resume version.",
  },
  {
    key: "interview",
    label: "4. Mock interview",
    description: "Generate interview questions and get scored feedback on your answers.",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
};

export default function ResumeLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<OutreachDraft | null>(null);
  const [outreachBusy, setOutreachBusy] = useState(false);

  async function load() {
    const [appRes, pipelineRes] = await Promise.all([
      fetch(`/api/applications/${id}`),
      fetch(`/api/applications/${id}/pipeline`),
    ]);
    const appData = await appRes.json();
    const pipelineData = await pipelineRes.json();
    if (appRes.ok) {
      setApplication(appData.application);
      if (appData.application?.outreachDraft) {
        try {
          setOutreach(JSON.parse(appData.application.outreachDraft));
        } catch {
          /* legacy plain-text draft; ignore */
        }
      }
    }
    if (pipelineRes.ok) setRuns(pipelineData.runs || []);
    setLoading(false);
  }

  async function generateOutreach() {
    setOutreachBusy(true);
    setError(null);
    const res = await fetch(`/api/applications/${id}/outreach`, { method: "POST" });
    const data = await res.json();
    setOutreachBusy(false);
    if (!res.ok) {
      setError(data.error || "Outreach generation failed");
      return;
    }
    setOutreach(data.draft);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runStep(step: string, extra?: Record<string, unknown>) {
    setRunningStep(step);
    setError(null);
    const res = await fetch(`/api/applications/${id}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, ...extra }),
    });
    const data = await res.json();
    setRunningStep(null);
    if (!res.ok) {
      setError(data.error || "Pipeline step failed");
      return;
    }
    await load();
  }

  function latestRun(step: string): PipelineRun | undefined {
    for (let i = runs.length - 1; i >= 0; i--) {
      if (runs[i].step === step) return runs[i];
    }
    return undefined;
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-zinc-500">Loading…</div>;
  }

  if (!application) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-red-600">Application not found.</p>
        <Link href="/" className="text-sm text-zinc-600 underline">
          Back to tracker
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← Back to tracker
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{application.title}</h1>
      <p className="text-zinc-600">
        {application.company}
        {application.location ? ` · ${application.location}` : ""}
      </p>

      {!application.jdText && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This job has no description text. Edit the job to add the JD before running the
          Resume Lab.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {STEPS.map((step) => {
          const run = latestRun(step.key);
          // Mock Interview unlocks only once the role reaches an interview stage.
          const locked =
            step.key === "interview" && !isInterviewStage(application.status);
          return (
            <section
              key={step.key}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-medium">{step.label}</h2>
                  <p className="text-sm text-zinc-500">{step.description}</p>
                </div>
                <button
                  onClick={() => runStep(step.key)}
                  disabled={!application.jdText || runningStep !== null || locked}
                  className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {runningStep === step.key
                    ? "Running…"
                    : locked
                    ? "🔒 Locked"
                    : run
                    ? "Run again"
                    : "Run"}
                </button>
              </div>

              {locked && (
                <p className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-500">
                  Unlocks when this application reaches an interview stage — set the
                  status to <strong>Interview requested</strong> or{" "}
                  <strong>Interviewing</strong> on the tracker (or let an interview
                  email move it there automatically).
                </p>
              )}

              {run && (
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  {step.key === "diagnose" && (
                    <DiagnoserView result={run.output as DiagnoserResult} />
                  )}
                  {step.key === "keywords" && (
                    <RecruiterView result={run.output as RecruiterResult} />
                  )}
                  {step.key === "rewrite" && (
                    <RewriterView result={run.output as RewriterResult} />
                  )}
                  {step.key === "interview" && (
                    <InterviewView
                      result={run.output as InterviewResult}
                      runs={runs}
                      onAnswer={(questionIndex, answer) =>
                        runStep("interview-answer", { questionIndex, answer })
                      }
                      submitting={runningStep === "interview-answer"}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}

        <ExportPanel resumeVersionId={application.resumeVersionId} fit={application.fit} />

        <OutreachPanel
          applicationId={application.id}
          draft={outreach}
          busy={outreachBusy}
          disabled={!application.jdText}
          onGenerate={generateOutreach}
          company={application.company}
          recruiterEmail={application.recruiterEmail}
          onSent={(to) =>
            setApplication((prev) => (prev ? { ...prev, recruiterEmail: to } : prev))
          }
        />
      </div>
    </div>
  );
}

function ExportPanel({
  resumeVersionId,
  fit,
}: {
  resumeVersionId: number | null;
  fit: { fitsOnePage: boolean; linesOver: number } | null;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Download tailored resume</h2>
      <p className="text-sm text-zinc-500">
        Two copies, always: a <strong>PDF</strong> to submit and a{" "}
        <strong>DOCX</strong> to edit.
      </p>
      {fit && !fit.fitsOnePage && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          ⚠️ This resume runs about{" "}
          <strong>
            {fit.linesOver} line{fit.linesOver > 1 ? "s" : ""}
          </strong>{" "}
          onto page 2 (Experience + Education don&rsquo;t both fit on page 1). Trim a few
          bullets or re-run the Rewriter before applying. You can still download it below.
        </div>
      )}
      {resumeVersionId ? (
        <>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={`/api/resume/${resumeVersionId}/export?format=pdf`}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              ↓ PDF — ready to apply
            </a>
            <a
              href={`/api/resume/${resumeVersionId}/export?format=docx`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              ↓ DOCX — editable
            </a>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            The PDF is your apply-ready copy — submit it as-is. To change anything,
            edit the DOCX (or re-run the Rewriter), then export a fresh PDF.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">No tailored version yet.</p>
      )}
    </section>
  );
}

function OutreachPanel({
  applicationId,
  draft,
  busy,
  disabled,
  onGenerate,
  company,
  recruiterEmail,
  onSent,
}: {
  applicationId: number;
  draft: OutreachDraft | null;
  busy: boolean;
  disabled: boolean;
  onGenerate: () => void;
  company: string;
  recruiterEmail: string | null;
  onSent: (to: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState(recruiterEmail || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Reset editable fields when a (re)generated draft or saved recipient arrives.
  const [prevDraft, setPrevDraft] = useState(draft);
  if (draft !== prevDraft) {
    setPrevDraft(draft);
    setSubject(draft?.subject || "");
    setBody(draft?.body || "");
    setSent(false);
  }
  const [prevRecruiterEmail, setPrevRecruiterEmail] = useState(recruiterEmail);
  if (recruiterEmail !== prevRecruiterEmail) {
    setPrevRecruiterEmail(recruiterEmail);
    setTo(recruiterEmail || "");
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    if (
      !window.confirm(
        `Send this email to ${to.trim()} now?\n\nSubject: ${subject}\n\nThis will send immediately via your connected Gmail account.`
      )
    ) {
      return;
    }
    setSending(true);
    setSendError(null);
    const res = await fetch(`/api/applications/${applicationId}/outreach/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.trim(), subject, body }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setSendError(data.error || "Failed to send email");
      return;
    }
    setSent(true);
    onSent(to.trim());
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Outreach draft</h2>
          <p className="text-sm text-zinc-500">
            A short personalized email. Review and edit before sending — nothing is sent
            without your confirmation.
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={disabled || busy}
          className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Drafting…" : draft ? "Regenerate" : "Generate"}
        </button>
      </div>

      {draft && (
        <div className="mt-4 border-t border-zinc-100 pt-4 text-sm">
          <label className="block text-xs font-medium text-zinc-500">To</label>
          <input
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setSent(false);
            }}
            placeholder="recruiter@company.com"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />

          <label className="mt-3 block text-xs font-medium text-zinc-500">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSent(false);
            }}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm font-medium"
          />

          <label className="mt-3 block text-xs font-medium text-zinc-500">Body</label>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSent(false);
            }}
            rows={8}
            className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1 font-sans text-sm text-zinc-700"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={send}
              disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send via Gmail"}
            </button>
            <button
              onClick={copy}
              className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={buildMailto({ subject, body }, to)}
              className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50"
            >
              Open in email client
            </a>
            <a
              href={buildLinkedInSearch(company)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50"
            >
              Find recruiter on LinkedIn ↗
            </a>
          </div>

          {sent && (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              ✓ Sent to {to.trim()}.
            </p>
          )}
          {sendError && <p className="mt-2 text-xs font-medium text-red-600">{sendError}</p>}

          <p className="mt-2 text-xs text-zinc-400">
            &ldquo;Send via Gmail&rdquo; sends this exact text immediately via your connected
            Gmail account, after a confirmation prompt. Or send it yourself: open your email
            client, or find the recruiter on LinkedIn and paste the message.
          </p>
        </div>
      )}
    </section>
  );
}

function DiagnoserView({ result }: { result: DiagnoserResult }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-zinc-700">{result.overallAssessment}</p>
      <ul className="flex flex-col gap-2">
        {result.issues?.map((issue, i) => (
          <li key={i} className="rounded border border-zinc-100 p-2">
            <span
              className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${
                SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low
              }`}
            >
              {issue.severity}
            </span>
            <span className="font-medium">{issue.issue}</span>
            <p className="mt-1 text-zinc-600">{issue.suggestion}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecruiterView({ result }: { result: RecruiterResult }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-zinc-700">{result.summary}</p>
      {result.matchedKeywords?.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-zinc-700">Already covered</p>
          <div className="flex flex-wrap gap-1">
            {result.matchedKeywords.map((kw, i) => (
              <span key={i} className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
      {result.missingKeywords?.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-zinc-700">Missing / underrepresented</p>
          <ul className="flex flex-col gap-2">
            {result.missingKeywords.map((kw, i) => (
              <li key={i} className="rounded border border-zinc-100 p-2">
                <span
                  className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${
                    SEVERITY_COLORS[kw.importance] || SEVERITY_COLORS.low
                  }`}
                >
                  {kw.importance}
                </span>
                <span className="font-medium">{kw.keyword}</span>
                <p className="mt-1 text-zinc-600">{kw.whereToAdd}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RewriterView({ result }: { result: RewriterResult }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-zinc-700">{result.summaryOfChanges}</p>
      <p className="text-xs text-zinc-400">
        A new tailored resume version has been saved for this application.
      </p>
      <ul className="flex flex-col gap-3">
        {result.bulletDiffs?.map((diff, i) => (
          <li key={i} className="rounded border border-zinc-100 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">
              {diff.title} @ {diff.company}
            </p>
            <p className="rounded bg-red-50 p-2 text-red-800 line-through">{diff.before}</p>
            <p className="mt-1 rounded bg-green-50 p-2 text-green-800">{diff.after}</p>
            <p className="mt-2 text-xs text-zinc-500">{diff.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InterviewView({
  result,
  runs,
  onAnswer,
  submitting,
}: {
  result: InterviewResult;
  runs: PipelineRun[];
  onAnswer: (questionIndex: number, answer: string) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [answeringIndex, setAnsweringIndex] = useState<number | null>(null);

  function feedbackFor(index: number): InterviewFeedback | undefined {
    for (let i = runs.length - 1; i >= 0; i--) {
      if (runs[i].step === `interview-answer-${index}`) {
        return runs[i].output as InterviewFeedback;
      }
    }
    return undefined;
  }

  return (
    <ul className="flex flex-col gap-4 text-sm">
      {result.questions?.map((q, i) => {
        const feedback = feedbackFor(i);
        return (
          <li key={i} className="rounded border border-zinc-100 p-3">
            <span className="mb-1 inline-block rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {q.category}
            </span>
            <p className="font-medium">{q.question}</p>
            <p className="mt-1 text-xs text-zinc-500">{q.whatGoodLooksLike}</p>
            <textarea
              value={answers[i] || ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
              rows={3}
              placeholder="Type your answer…"
              className="mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <button
              onClick={() => {
                setAnsweringIndex(i);
                onAnswer(i, answers[i] || "");
              }}
              disabled={submitting || !(answers[i] || "").trim()}
              className="mt-2 rounded border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {submitting && answeringIndex === i ? "Scoring…" : "Get feedback"}
            </button>

            {feedback && (
              <div className="mt-3 rounded bg-zinc-50 p-2">
                <p className="text-xs font-semibold text-zinc-700">
                  Score: {feedback.score}/10
                </p>
                {feedback.strengths?.length > 0 && (
                  <div className="mt-1">
                    <p className="text-xs font-medium text-green-700">Strengths</p>
                    <ul className="list-disc pl-4 text-xs text-zinc-600">
                      {feedback.strengths.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.improvements?.length > 0 && (
                  <div className="mt-1">
                    <p className="text-xs font-medium text-amber-700">Improvements</p>
                    <ul className="list-disc pl-4 text-xs text-zinc-600">
                      {feedback.improvements.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.suggestedAnswer && (
                  <div className="mt-1">
                    <p className="text-xs font-medium text-zinc-700">Suggested answer</p>
                    <p className="text-xs text-zinc-600">{feedback.suggestedAnswer}</p>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
