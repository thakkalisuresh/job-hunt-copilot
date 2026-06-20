"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FeedJob } from "../api/feed/route";

const SPONSORSHIP_LABELS: Record<string, { label: string; cls: string }> = {
  known_sponsor: { label: "Known sponsor", cls: "bg-emerald-100 text-emerald-700" },
  likely: { label: "Likely sponsor", cls: "bg-green-100 text-green-700" },
  unclear: { label: "Sponsorship unclear", cls: "bg-zinc-100 text-zinc-600" },
  no: { label: "No sponsorship", cls: "bg-red-100 text-red-700" },
};

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  "staff+": "Staff+",
};

interface Filters {
  postedWithin: string;
  remoteType: string;
  seniority: string;
  sponsorship: string;
  source: string;
  company: string;
  minFit: string;
  maxYears: string;
  jobLevel: string;
}

const EMPTY_FILTERS: Filters = {
  postedWithin: "",
  remoteType: "",
  seniority: "",
  sponsorship: "",
  source: "",
  company: "",
  minFit: "",
  maxYears: "",
  jobLevel: "",
};

export default function FeedPage() {
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    const res = await fetch(`/api/feed?${qs.toString()}`);
    const data = await res.json();
    setJobs(data.jobs || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setMessage(null);
    const res = await fetch("/api/feed/refresh", { method: "POST" });
    const data = await res.json();
    setRefreshing(false);
    if (!res.ok) {
      setMessage(data.error || "Refresh failed");
      return;
    }
    setMessage(
      `Fetched ${data.fetched}, added ${data.inserted} new, enriched ${data.enriched}.` +
        (data.errors?.length ? ` ${data.errors.length} source error(s).` : "")
    );
    load();
  }

  async function save(jobId: number) {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) load();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Job Feed</h1>
          <p className="text-sm text-zinc-600">
            Fresh postings from public APIs, scored against your master resume.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          {message}
        </div>
      )}

      <FilterBar filters={filters} setFilters={setFilters} />

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-zinc-500">
          No jobs yet. Click <span className="font-medium">Refresh now</span> to pull
          postings, or adjust filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{job.title}</div>
                  <div className="text-sm text-zinc-600">
                    {job.company}
                    {job.company_summary && (
                      <span
                        className="ml-1 cursor-help text-zinc-400"
                        title={job.company_summary}
                      >
                        ⓘ
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {job.location || "—"}
                    {job.posted_date &&
                      ` · ${new Date(job.posted_date).toLocaleDateString()}`}
                    {job.source && ` · ${job.source}`}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {job.fit_score != null && (
                    <div className="rounded bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
                      {job.fit_score}
                    </div>
                  )}
                  {job.embed_score != null && (
                    <div
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500"
                      title="Semantic similarity of this JD to your resume (text-embedding-3-small)"
                    >
                      emb {Math.round(job.embed_score)}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {job.sponsorship_tag && SPONSORSHIP_LABELS[job.sponsorship_tag] && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${SPONSORSHIP_LABELS[job.sponsorship_tag].cls}`}
                  >
                    {SPONSORSHIP_LABELS[job.sponsorship_tag].label}
                  </span>
                )}
                {job.job_level ? (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {job.job_level}
                  </span>
                ) : job.seniority_tag ? (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {SENIORITY_LABELS[job.seniority_tag] || job.seniority_tag}
                  </span>
                ) : null}
                {job.min_years != null && (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {job.min_years}+ yrs
                  </span>
                )}
                {job.remote_type && job.remote_type !== "unknown" && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    {job.remote_type}
                  </span>
                )}
                {job.salary_range && (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {job.salary_range}
                  </span>
                )}
                {job.industry && (
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                    {job.industry}
                  </span>
                )}
              </div>

              {job.fit_summary && (
                <p className="mt-2 text-xs text-zinc-500">{job.fit_summary}</p>
              )}

              {job.skills_json && (() => {
                try {
                  const skills: string[] = JSON.parse(job.skills_json);
                  if (!skills.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skills.slice(0, 8).map((s) => (
                        <span
                          key={s}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-500"
                        >
                          {s}
                        </span>
                      ))}
                      {skills.length > 8 && (
                        <span className="text-xs text-zinc-400">+{skills.length - 8} more</span>
                      )}
                    </div>
                  );
                } catch { return null; }
              })()}

              <div className="mt-3 flex items-center gap-3 text-xs">
                {job.application_id ? (
                  <Link
                    href={`/lab/${job.application_id}`}
                    className="rounded border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-50"
                  >
                    Open Resume Lab
                  </Link>
                ) : (
                  <button
                    onClick={() => save(job.id)}
                    className="rounded bg-zinc-900 px-2 py-1 font-medium text-white hover:bg-zinc-700"
                  >
                    Save to tracker
                  </button>
                )}
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    View posting
                  </a>
                )}
                {job.status && (
                  <span className="ml-auto text-zinc-400">{job.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  function set<K extends keyof Filters>(key: K, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  const selectCls = "rounded border border-zinc-300 px-2 py-1 text-xs";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <select
        value={filters.postedWithin}
        onChange={(e) => set("postedWithin", e.target.value)}
        className={selectCls}
      >
        <option value="">Any date</option>
        <option value="1">Last 24h</option>
        <option value="3">Last 3 days</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>
      <select
        value={filters.remoteType}
        onChange={(e) => set("remoteType", e.target.value)}
        className={selectCls}
      >
        <option value="">Any location</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">Onsite</option>
      </select>
      <select
        value={filters.seniority}
        onChange={(e) => set("seniority", e.target.value)}
        className={selectCls}
      >
        <option value="">Any seniority</option>
        <option value="junior">Junior</option>
        <option value="mid">Mid</option>
        <option value="senior">Senior</option>
        <option value="staff+">Staff+</option>
      </select>
      <select
        value={filters.sponsorship}
        onChange={(e) => set("sponsorship", e.target.value)}
        className={selectCls}
      >
        <option value="">Any sponsorship</option>
        <option value="known_sponsor">Known sponsor</option>
        <option value="likely">Likely</option>
        <option value="unclear">Unclear</option>
        <option value="no">No sponsorship</option>
      </select>
      <input
        value={filters.maxYears}
        onChange={(e) => set("maxYears", e.target.value)}
        placeholder="Max yrs req"
        className={`${selectCls} w-24`}
      />
      <input
        value={filters.minFit}
        onChange={(e) => set("minFit", e.target.value)}
        placeholder="Min fit"
        className={`${selectCls} w-20`}
      />
      <input
        value={filters.company}
        onChange={(e) => set("company", e.target.value)}
        placeholder="Company"
        className={`${selectCls} w-32`}
      />
      <select
        value={filters.jobLevel}
        onChange={(e) => set("jobLevel", e.target.value)}
        className={selectCls}
      >
        <option value="">Any level</option>
        <option value="Entry">Entry</option>
        <option value="Mid">Mid</option>
        <option value="Senior">Senior</option>
        <option value="Lead">Lead</option>
        <option value="Manager">Manager</option>
        <option value="Director">Director</option>
        <option value="VP">VP</option>
      </select>
      <button
        onClick={() => setFilters(EMPTY_FILTERS)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
      >
        Clear
      </button>
    </div>
  );
}
