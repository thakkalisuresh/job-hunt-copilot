import { NormalizedJob } from "./types";
import { htmlToText } from "./html";

interface RemoteOkPost {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  date?: string;
  description?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
  // The first element of the response is a legal/attribution notice, not a job.
  legal?: string;
}

/** RemoteOK public API. Returns remote jobs across companies. */
export async function fetchRemoteOk(): Promise<NormalizedJob[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: {
      Accept: "application/json",
      // RemoteOK asks API consumers to identify themselves.
      "User-Agent": "job-hunt-copilot (personal job search tool)",
    },
  });
  if (!res.ok) {
    throw new Error(`RemoteOK: HTTP ${res.status}`);
  }
  const data = (await res.json()) as RemoteOkPost[];
  return (data || [])
    .filter((p) => p.position && p.company)
    .map((p) => {
      const salary =
        p.salary_min && p.salary_max
          ? `$${p.salary_min.toLocaleString()}–$${p.salary_max.toLocaleString()}`
          : null;
      return {
        source: "remoteok",
        company: p.company as string,
        title: p.position as string,
        location: p.location || "Remote",
        remoteType: "remote" as const,
        postedDate: p.date ? new Date(p.date).toISOString() : null,
        jdText: p.description ? htmlToText(p.description) : null,
        url: p.url || (p.slug ? `https://remoteok.com/remote-jobs/${p.slug}` : null),
        salaryRange: salary,
      };
    });
}
