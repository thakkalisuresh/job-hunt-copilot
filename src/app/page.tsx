"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import type { JobWithApplication } from "./api/jobs/route";
import type { ReviewItem } from "./api/email/triage/review/route";
import { APPLICATION_STATUSES } from "@/lib/statuses";

const STATUSES = APPLICATION_STATUSES;

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_STATUSES.map((s) => [s.key, s.label])
);

type PageFit = { fitsOnePage: boolean; linesOver: number };

export default function TrackerPage() {
  const [jobs, setJobs] = useState<JobWithApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [masterFit, setMasterFit] = useState<PageFit | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  async function load() {
    const [jobsRes, resumeRes, reviewRes] = await Promise.all([
      fetch("/api/jobs"),
      fetch("/api/resume"),
      fetch("/api/email/triage/review"),
    ]);
    const data = await jobsRes.json();
    setJobs(data.jobs || []);
    try {
      const resumeData = await resumeRes.json();
      setMasterFit(resumeData.resume?.fit ?? null);
    } catch {
      /* no master resume yet */
    }
    try {
      const reviewData = await reviewRes.json();
      setReviewItems(reviewData.items || []);
    } catch {
      /* triage table not populated yet */
    }
    setLoading(false);
  }

  async function resolveReviewItem(id: number, action: "confirm" | "dismiss") {
    setReviewItems((prev) => prev.filter((item) => item.id !== id));
    await fetch(`/api/email/triage/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (action === "confirm") load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function updateStatus(applicationId: number, status: string) {
    setJobs((prev) =>
      prev.map((j) =>
        j.application_id === applicationId ? { ...j, status } : j
      )
    );
    await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tracker</h1>
          <p className="text-sm text-zinc-600">
            Track applications from saved through offer.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          {showForm ? "Cancel" : "Add job"}
        </button>
      </div>

      {masterFit && !masterFit.fitsOnePage && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ Your master résumé&rsquo;s Work Experience + Education run about{" "}
          <strong>
            {masterFit.linesOver} line{masterFit.linesOver > 1 ? "s" : ""}
          </strong>{" "}
          onto page 2. Recruiters prefer both on page 1 — trim or rework a few bullets in{" "}
          <Link href="/setup" className="font-medium underline">
            Setup
          </Link>
          .
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-blue-900">
            Needs review{" "}
            <span className="text-blue-500">({reviewItems.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {reviewItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-md border border-blue-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {item.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    From {item.fromAddress || "unknown"}
                    {item.company && (
                      <>
                        {" "}
                        — matched to <strong>{item.company}</strong>
                        {item.title ? ` (${item.title})` : ""}
                      </>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Suggests:{" "}
                    <strong>
                      {STATUS_LABELS[item.suggestedStatus ?? ""] ?? item.suggestedStatus}
                    </strong>{" "}
                    &middot; confidence: {item.confidence}
                    {item.reason ? ` — ${item.reason}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  {item.applicationId && (
                    <button
                      onClick={() => resolveReviewItem(item.id, "confirm")}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                    >
                      Apply status
                    </button>
                  )}
                  <button
                    onClick={() => resolveReviewItem(item.id, "dismiss")}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <AddJobForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
          {STATUSES.map((col) => (
            <div key={col.key} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-700">
                {col.label}{" "}
                <span className="text-zinc-400">
                  ({jobs.filter((j) => j.status === col.key).length})
                </span>
              </h2>
              <div className="flex flex-col gap-3">
                {jobs
                  .filter((j) => j.status === col.key)
                  .map((job) => (
                    <div
                      key={job.application_id}
                      className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm"
                    >
                      <div className="font-medium">{job.title}</div>
                      <div className="text-sm text-zinc-600">{job.company}</div>
                      {job.location && (
                        <div className="text-xs text-zinc-400">{job.location}</div>
                      )}
                      {job.education_overflow_lines > 0 && (
                        <div
                          className="mt-1 text-xs text-amber-700"
                          title="Trim or rework a few bullets so Experience + Education fit on page 1."
                        >
                          ⚠️ Résumé runs ~{job.education_overflow_lines} line
                          {job.education_overflow_lines > 1 ? "s" : ""} onto page 2
                        </div>
                      )}
                      <div className="mt-3 flex flex-col gap-2">
                        <select
                          value={job.status}
                          onChange={(e) =>
                            updateStatus(job.application_id, e.target.value)
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <Link
                          href={`/lab/${job.application_id}`}
                          className="rounded border border-zinc-300 px-2 py-1 text-center text-xs font-medium hover:bg-zinc-50"
                        >
                          Open Resume Lab
                        </Link>
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-center text-xs text-zinc-400 hover:text-zinc-600"
                          >
                            View posting
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddJobForm({ onCreated }: { onCreated: () => void }) {
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!company.trim() || !title.trim()) {
      setError("Company and title are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, title, location, url, jdText }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create job");
      return;
    }
    setCompany("");
    setTitle("");
    setLocation("");
    setUrl("");
    setJdText("");
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Company *</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Location</label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-600">Posting URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="col-span-1 flex flex-col gap-1 md:col-span-2">
        <label className="text-xs font-medium text-zinc-600">
          Job description (used by Resume Lab)
        </label>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={6}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      </div>
      {error && <p className="col-span-1 text-sm text-red-600 md:col-span-2">{error}</p>}
      <div className="col-span-1 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save job"}
        </button>
      </div>
    </form>
  );
}
