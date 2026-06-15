import { ApifyActorConfig, genericApifyMap } from "./apify";

/**
 * Job-source configuration. Edit these lists to control where the Job Feed
 * pulls from. All of these are public JSON APIs except Apify (cloud scraping).
 *
 * Greenhouse/Lever tokens are the company slug in the careers URL, e.g.
 * https://boards.greenhouse.io/stripe -> "stripe"
 * https://jobs.lever.co/netflix      -> "netflix"
 */
export const GREENHOUSE_BOARDS: string[] = [
  "stripe",
  "airbnb",
  "databricks",
  "coinbase",
  "figma",
];

export const LEVER_COMPANIES: string[] = ["netflix", "plaid"];

export const ENABLE_REMOTEOK = true;

export const ENABLE_HACKERNEWS = true;

/**
 * Apify actors to run (only used if APIFY_TOKEN is set). Each needs an actorId,
 * an input, and a map function. The default list is empty — add actors for the
 * career pages you care about that lack a public API.
 */
export const APIFY_ACTORS: ApifyActorConfig[] = [
  // Example (disabled by default — uncomment and set a real actor + input):
  // {
  //   actorId: "your-username~career-page-scraper",
  //   input: { startUrls: [{ url: "https://example.com/careers" }] },
  //   map: (item) => genericApifyMap("apify:example", item),
  // },
];

// Referenced so the import is retained for users who enable an actor above.
void genericApifyMap;

/** Max postings stored per refresh, across all sources (newest first). */
export const FEED_REFRESH_LIMIT = Number(process.env.FEED_REFRESH_LIMIT || 50);
