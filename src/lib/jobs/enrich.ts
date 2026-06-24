import { completeJson, hasLlmKey } from "../llm";
import { ResumeData } from "../resume";
import { JobEnrichment, NormalizedJob } from "./types";
import { lookupSponsor } from "./sponsor";
import { enrichJobHeuristic } from "./heuristic";

interface RawEnrichment {
  sponsorshipTag: string;
  seniorityTag: string;
  minYears: number | null;
  fitScore: number | null;
  fitSummary: string | null;
}

const SPONSORSHIP_VALUES = ["known_sponsor", "likely", "unclear", "no"];
const SENIORITY_VALUES = ["junior", "mid", "senior", "staff+"];

function enrichmentPrompt(
  job: NormalizedJob,
  resume: ResumeData | null
): string {
  const resumeBlock = resume
    ? `\nCandidate's resume (structured JSON), for the fit score:\n${JSON.stringify(
        { summary: resume.summary, experience: resume.experience, skills: resume.skills },
        null,
        2
      )}\n`
    : "\n(No candidate resume provided — set fitScore and fitSummary to null.)\n";

  return `You are analyzing a single job posting for a job-search app.

Job title: ${job.title}
Company: ${job.company}
Location: ${job.location || "(unknown)"}
Job description:
"""
${(job.jdText || "(no description)").slice(0, 6000)}
"""
${resumeBlock}
Classify the posting and return ONLY a JSON object with this exact shape:
{
  "sponsorshipTag": "known_sponsor" | "likely" | "unclear" | "no",
  "seniorityTag": "junior" | "mid" | "senior" | "staff+",
  "minYears": number | null,
  "fitScore": number | null,
  "fitSummary": string | null
}

Guidance:
- sponsorshipTag: "no" if the JD explicitly says no visa sponsorship / must already have work authorization; "likely" if it mentions sponsoring visas or being open to it; otherwise "unclear". (A separate database handles "known_sponsor" — never output it yourself.)
- seniorityTag: infer from title + requirements.
- minYears: minimum years of experience required, or null if unstated.
- fitScore: 0-100 how well the candidate's resume matches this job (null if no resume).
- fitSummary: one sentence on the fit (null if no resume).`;
}

/** Apply the DOL LCA known-sponsor override to any enrichment result. */
export function applySponsorOverride(enrichment: JobEnrichment, company: string): JobEnrichment {
  if (enrichment.sponsorshipTag !== "no" && lookupSponsor(company)) {
    return { ...enrichment, sponsorshipTag: "known_sponsor" };
  }
  return enrichment;
}

/**
 * Enrich one job, layering in the DOL sponsor lookup.
 *
 * Uses the configured LLM provider when a key is set; falls back to the offline
 * heuristic scorer (`enrichJobHeuristic`) when no key is configured OR the
 * provider call fails (rate limit / out of credits / parse error) so the feed
 * always gets a fit signal without ever blocking on an external API.
 */
export async function enrichJob(
  job: NormalizedJob,
  resume: ResumeData | null
): Promise<JobEnrichment> {
  if (!hasLlmKey()) {
    return applySponsorOverride(enrichJobHeuristic(job, resume), job.company);
  }

  // Retry transient LLM failures (free-tier 429/503, occasional bad JSON) with
  // backoff before falling back to the heuristic — otherwise one blip drops a
  // job to the cruder flat-domain score even though the provider is healthy.
  const prompt = enrichmentPrompt(job, resume);
  let raw: RawEnrichment | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      raw = await completeJson<RawEnrichment>(prompt);
      break;
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  if (!raw) {
    // LLM still unavailable after retries — degrade gracefully.
    return applySponsorOverride(enrichJobHeuristic(job, resume), job.company);
  }

  const sponsorshipTag = SPONSORSHIP_VALUES.includes(raw.sponsorshipTag)
    ? (raw.sponsorshipTag as JobEnrichment["sponsorshipTag"])
    : "unclear";

  const seniorityTag = SENIORITY_VALUES.includes(raw.seniorityTag)
    ? (raw.seniorityTag as JobEnrichment["seniorityTag"])
    : "mid";

  return applySponsorOverride(
    {
      sponsorshipTag,
      seniorityTag,
      minYears: typeof raw.minYears === "number" ? raw.minYears : null,
      fitScore: typeof raw.fitScore === "number" ? raw.fitScore : null,
      fitSummary: raw.fitSummary || null,
    },
    job.company
  );
}

export { hasLlmKey };
