import { ApifyClient } from "apify-client";
import { NormalizedJob } from "./types";
import { htmlToText, inferRemoteType } from "./html";

export interface ApifyActorConfig {
  /** Apify actor id or name, e.g. "apify/website-content-crawler". */
  actorId: string;
  /** Input passed to the actor run. */
  input: Record<string, unknown>;
  /** Maps a raw dataset item to a NormalizedJob, or null to skip it. */
  map: (item: Record<string, unknown>) => NormalizedJob | null;
}

/**
 * Run an Apify actor and normalize its dataset output. Apify runs scrapers in
 * its own cloud (headless browsers + rotating proxies) so the local machine is
 * never the one being rate-limited or blocked.
 */
export async function fetchApify(
  config: ApifyActorConfig
): Promise<NormalizedJob[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("APIFY_TOKEN is not set");
  }
  const client = new ApifyClient({ token });
  const run = await client.actor(config.actorId).call(config.input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const jobs: NormalizedJob[] = [];
  for (const item of items) {
    const job = config.map(item as Record<string, unknown>);
    if (job) jobs.push(job);
  }
  return jobs;
}

/**
 * A generic mapper for actors that emit objects with common job-board field
 * names. Adjust per actor in src/lib/jobs/sources.ts as needed.
 */
export function genericApifyMap(
  source: string,
  item: Record<string, unknown>
): NormalizedJob | null {
  const str = (k: string): string | null => {
    const v = item[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const title = str("title") || str("position") || str("jobTitle");
  const company = str("company") || str("companyName") || str("employer");
  if (!title || !company) return null;
  const location = str("location") || str("city");
  const description =
    str("description") || str("descriptionHtml") || str("jobDescription");
  const posted = str("postedAt") || str("date") || str("publishedAt");
  return {
    source,
    company,
    title,
    location,
    remoteType: inferRemoteType(location),
    postedDate: posted ? safeIso(posted) : null,
    jdText: description ? htmlToText(description) : null,
    url: str("url") || str("link") || str("jobUrl"),
    salaryRange: str("salary") || str("salaryRange"),
  };
}

function safeIso(value: string): string | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
