import { NormalizedJob } from "./types";
import { inferRemoteType } from "./html";

/**
 * LinkedIn Jobs guest API — no auth required, no API key, completely free.
 * Scrapes LinkedIn's public job search endpoint and extracts card-level data
 * (title, company, location, URL, date). Job descriptions are not included
 * because fetching each detail page would require per-job requests; the
 * enrichment step scores on title+company which is sufficient for HR roles.
 *
 * LinkedIn may return an empty list or a CSRF challenge if rate-limited —
 * that is handled gracefully (returns [] rather than throwing).
 */
export async function fetchLinkedIn(
  keywords: string,
  location: string
): Promise<NormalizedJob[]> {
  const url = new URL(
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
  );
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("location", location);
  url.searchParams.set("start", "0");
  url.searchParams.set("count", "25");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // LinkedIn sometimes returns 429 or a redirect — treat as empty rather than crashing.
  if (!res.ok) {
    if (res.status === 429 || res.status === 302) return [];
    throw new Error(`LinkedIn "${keywords}": HTTP ${res.status}`);
  }

  const html = await res.text();
  return parseCards(html, keywords);
}

function extractFirst(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? m[1] : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function parseCards(html: string, sourceQuery: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];

  // Each job card is wrapped in a <li>. Split there and process individually.
  const chunks = html.split(/<li[\s>]/);
  for (const chunk of chunks.slice(1)) {
    const rawTitle = extractFirst(
      chunk,
      /class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/
    );
    const rawCompany = extractFirst(
      chunk,
      /class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/
    );
    const rawLocation = extractFirst(
      chunk,
      /class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/
    );
    // Pull URL from the full-link anchor; strip tracking query params.
    const rawUrl = extractFirst(
      chunk,
      /class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/
    );
    const rawDate = extractFirst(chunk, /datetime="([0-9]{4}-[0-9]{2}-[0-9]{2})"/);

    const title = rawTitle ? stripTags(rawTitle) : null;
    const company = rawCompany ? stripTags(rawCompany) : null;

    if (!title || !company) continue;

    const location = rawLocation ? stripTags(rawLocation) : null;
    const jobUrl = rawUrl ? rawUrl.split("?")[0] : null;

    jobs.push({
      source: `linkedin:${sourceQuery}`,
      company,
      title,
      location,
      remoteType: inferRemoteType(location),
      postedDate: rawDate ? new Date(rawDate).toISOString() : null,
      jdText: null,
      url: jobUrl,
      salaryRange: null,
    });
  }

  return jobs;
}
