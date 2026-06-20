export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

/** A job posting normalized from any source into the shape we store in `jobs`. */
export interface NormalizedJob {
  source: string;
  company: string;
  title: string;
  location: string | null;
  remoteType: RemoteType;
  postedDate: string | null; // ISO 8601
  jdText: string | null;
  url: string | null;
  salaryRange: string | null;
}

export type SponsorshipTag = "known_sponsor" | "likely" | "unclear" | "no";
export type SeniorityTag = "junior" | "mid" | "senior" | "staff+";

/** Extended job type for rows that originate from the open-jobs dataset. */
export interface OpenJobsJob extends NormalizedJob {
  openJobsId: string;
  skillsJson: string[] | null;
  companySummary: string | null;
  industry: string | null;
  jobLevel: string | null;    // open-jobs level enum (Entry/Mid/Senior/Manager/Director/…)
  jobFunction: string | null; // "hr" | "engineering" | …
  embedScore: number | null;
}

export interface JobEnrichment {
  sponsorshipTag: SponsorshipTag;
  seniorityTag: SeniorityTag;
  minYears: number | null;
  fitScore: number | null; // 0-100 vs master resume, null if no resume
  fitSummary: string | null;
}
