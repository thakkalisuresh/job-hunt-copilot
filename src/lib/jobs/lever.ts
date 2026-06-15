import { NormalizedJob } from "./types";
import { inferRemoteType } from "./html";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
}

/**
 * Lever public postings API. `company` is the token in the URL,
 * e.g. "netflix" -> https://jobs.lever.co/netflix
 */
export async function fetchLever(company: string): Promise<NormalizedJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    company
  )}?mode=json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Lever ${company}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as LeverPosting[];
  return (data || []).map((p) => {
    const location = p.categories?.location || null;
    const listsText = (p.lists || [])
      .map((l) => `${l.text}\n${l.content.replace(/<[^>]+>/g, " ")}`)
      .join("\n\n");
    const jd = [p.descriptionPlain, listsText, p.additionalPlain]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return {
      source: `lever:${company}`,
      company,
      title: p.text,
      location,
      remoteType: inferRemoteType(location),
      postedDate: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      jdText: jd || null,
      url: p.hostedUrl,
      salaryRange: null,
    };
  });
}
