import { completeJson, hasLlmKey } from "../llm";
import { ResumeData } from "../resume";
import { JobEnrichment, NormalizedJob } from "./types";
import { lookupSponsor } from "./sponsor";

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

/** Enrich one job via the LLM, layering in the DOL sponsor lookup. */
export async function enrichJob(
  job: NormalizedJob,
  resume: ResumeData | null
): Promise<JobEnrichment> {
  const raw = await completeJson<RawEnrichment>(enrichmentPrompt(job, resume));

  let sponsorshipTag = SPONSORSHIP_VALUES.includes(raw.sponsorshipTag)
    ? (raw.sponsorshipTag as JobEnrichment["sponsorshipTag"])
    : "unclear";
  // DOL LCA data overrides "unclear"/"likely" with a known-sponsor signal.
  if (sponsorshipTag !== "no" && lookupSponsor(job.company)) {
    sponsorshipTag = "known_sponsor";
  }

  const seniorityTag = SENIORITY_VALUES.includes(raw.seniorityTag)
    ? (raw.seniorityTag as JobEnrichment["seniorityTag"])
    : "mid";

  return {
    sponsorshipTag,
    seniorityTag,
    minYears: typeof raw.minYears === "number" ? raw.minYears : null,
    fitScore: typeof raw.fitScore === "number" ? raw.fitScore : null,
    fitSummary: raw.fitSummary || null,
  };
}

export { hasLlmKey };
