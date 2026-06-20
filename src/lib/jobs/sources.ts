import { ApifyActorConfig, genericApifyMap } from "./apify";

/**
 * Job-source configuration. Edit these lists to control where the Job Feed
 * pulls from. All of these are public JSON APIs except Apify (cloud scraping).
 *
 * Greenhouse/Lever tokens are the company slug in the careers URL, e.g.
 * https://boards.greenhouse.io/stripe -> "stripe"
 * https://jobs.lever.co/netflix      -> "netflix"
 */
// HR/People Ops–focused boards with verified WA-state offices.
// Greenhouse slug = company token in https://boards.greenhouse.io/{slug}
// Verified 2026-06-15: each board returns 200 from the Greenhouse API and has
// confirmed HR/People Ops/Recruiting postings with Seattle or Bellevue locations.
export const GREENHOUSE_BOARDS: string[] = [
  // Confirmed WA HR roles as of 2026-06-15
  "okta",          // Bellevue office — Head of Recruiting Ops, Recruiting Tech Manager
  "tanium",        // Bellevue HQ — Senior HR Business Partner (Bellevue hybrid)
  "brex",          // Seattle office — Senior Design Recruiter, Technical Recruiting Mgr
  "samsara",       // Remote-Seattle — People Analytics AI Engineer
  "mongodb",       // Seattle — Senior Director, HR Business Partnering
  "stripe",        // People Partner role lists Seattle among locations
  // WA-HQ boards that cycle HR roles regularly
  "thetradedesk",  // Bellevue HQ (195 jobs) — Compensation, Recruiting roles post here
  "smartsheet",    // Bellevue HQ (103 jobs) — HR roles cycle through regularly
];

// Lever slug = company token in https://jobs.lever.co/{slug}
// All three are Seattle-headquartered with active boards.
export const LEVER_COMPANIES: string[] = [
  "highspot",  // Seattle HQ
  "rover",     // Seattle HQ
  "outreach",  // Seattle HQ
];

export const ENABLE_REMOTEOK = true;

export const ENABLE_HACKERNEWS = true;

/**
 * JSearch (RapidAPI) — aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter.
 * Requires RAPIDAPI_KEY in .env.local. Free tier: 500 requests/month.
 * Sign up at rapidapi.com → search "JSearch" → subscribe to the free plan.
 * Each string is a natural-language query sent to the search API.
 * Only runs when RAPIDAPI_KEY is present; no-ops silently otherwise.
 */
export const JSEARCH_QUERIES: string[] = [
  "HR Business Partner Seattle WA",
  "People Operations Manager Seattle WA",
  "Talent Acquisition Recruiter Seattle WA",
  "HRBP Bellevue WA",
  "Learning Development Manager Seattle WA",
  "HR Generalist Seattle WA",
];

/**
 * LinkedIn Jobs guest API — no account or key required.
 * Scrapes LinkedIn's public job search (card-level data; no descriptions).
 * Set ENABLE_LINKEDIN=false to disable if LinkedIn starts blocking requests.
 */
export const LINKEDIN_QUERIES: Array<{ keywords: string; location: string }> = [
  { keywords: "HR Business Partner", location: "Seattle, WA" },
  { keywords: "People Operations", location: "Seattle, WA" },
  { keywords: "Talent Acquisition", location: "Bellevue, WA" },
  { keywords: "Recruiter HR", location: "Seattle, WA" },
  { keywords: "Learning Development", location: "Seattle, WA" },
];

export const ENABLE_LINKEDIN = true;

/**
 * Apify actors to run. Only runs when APIFY_TOKEN is set (see refresh.ts), so
 * leaving the token empty disables this whole source — no cost, no error.
 *
 * COST NOTE: Apify is NOT free for ongoing use. The free plan gives ~$5/month of
 * platform credits, which covers a handful of small runs; a daily scrape will
 * exhaust it. Treat this as an optional paid booster on top of the free sources
 * (Greenhouse/Lever/RemoteOK/HackerNews/JSearch/LinkedIn). See BACKLOG "$0 refresh".
 *
 * Default below: the misceres/indeed-scraper actor, scoped to HR roles in
 * Seattle. Indeed output fields (positionName/company/descriptionHTML/…) are
 * handled by genericApifyMap. Tune `position`/`location`/`maxItems` as needed.
 */
export const APIFY_ACTORS: ApifyActorConfig[] = [
  {
    actorId: "misceres/indeed-scraper",
    input: {
      position: "Human Resources",
      location: "Seattle, WA",
      country: "US",
      maxItems: 40,
      parseCompanyDetails: false,
      followApplyRedirects: false,
    },
    map: (item) => genericApifyMap("apify:indeed", item),
  },
];

/** Max postings stored per refresh, across all sources (newest first). */
export const FEED_REFRESH_LIMIT = Number(process.env.FEED_REFRESH_LIMIT || 50);

/**
 * Geographic location filter (pipe-separated |). Only jobs whose location string
 * contains at least one term are inserted. Remote jobs are filtered by location too.
 * Leave empty to keep all locations.
 * Example: FEED_LOCATION_FILTER=Seattle|Bellevue|Redmond|, Washington|Remote - Washington
 * Note: pipe separator allows terms that contain commas (e.g. ", Washington").
 */
export const FEED_LOCATION_FILTER: string[] = process.env.FEED_LOCATION_FILTER
  ? process.env.FEED_LOCATION_FILTER.split("|").map((s) => s.trim()).filter(Boolean)
  : [];
