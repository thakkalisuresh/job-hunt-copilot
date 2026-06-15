import { NormalizedJob } from "./types";
import { htmlToText, inferRemoteType } from "./html";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
}

/**
 * Greenhouse public board API. `board` is the company token used in the URL,
 * e.g. "stripe" -> https://boards.greenhouse.io/stripe
 */
export async function fetchGreenhouse(board: string): Promise<NormalizedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    board
  )}/jobs?content=true`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Greenhouse ${board}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return (data.jobs || []).map((j) => {
    const location = j.location?.name || null;
    return {
      source: `greenhouse:${board}`,
      company: board,
      title: j.title,
      location,
      remoteType: inferRemoteType(location),
      postedDate: j.updated_at ? new Date(j.updated_at).toISOString() : null,
      jdText: j.content ? htmlToText(j.content) : null,
      url: j.absolute_url,
      salaryRange: null,
    };
  });
}
