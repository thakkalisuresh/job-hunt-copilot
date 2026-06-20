import { NormalizedJob } from "./types";
import { inferRemoteType } from "./html";

interface JSearchJob {
  job_title: string;
  employer_name: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_description?: string;
  job_apply_link?: string;
  job_min_salary?: number;
  job_max_salary?: number;
}

/**
 * JSearch via RapidAPI — aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter.
 * Requires RAPIDAPI_KEY in env. Free tier: 500 requests/month.
 * Sign up: rapidapi.com → search "JSearch" → subscribe to the free plan.
 * `query` should be a natural-language job search, e.g. "HR Business Partner Seattle WA".
 */
export async function fetchJSearch(query: string): Promise<NormalizedJob[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];

  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });
  if (!res.ok) throw new Error(`JSearch "${query}": HTTP ${res.status}`);

  const body = (await res.json()) as { data?: JSearchJob[] };
  const jobs = body.data ?? [];

  return jobs
    .filter((j) => j.job_title && j.employer_name)
    .map((j) => {
      const location = [j.job_city, j.job_state].filter(Boolean).join(", ") || j.job_country || null;
      const salary =
        j.job_min_salary && j.job_max_salary
          ? `$${j.job_min_salary.toLocaleString()}–$${j.job_max_salary.toLocaleString()}`
          : null;
      return {
        source: `jsearch:${query}`,
        company: j.employer_name,
        title: j.job_title,
        location,
        remoteType: j.job_is_remote ? ("remote" as const) : inferRemoteType(location),
        postedDate: j.job_posted_at_datetime_utc
          ? new Date(j.job_posted_at_datetime_utc).toISOString()
          : null,
        jdText: j.job_description ?? null,
        url: j.job_apply_link ?? null,
        salaryRange: salary,
      };
    });
}
