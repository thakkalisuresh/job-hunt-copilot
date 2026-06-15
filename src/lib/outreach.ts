import { ResumeData } from "./resume";
import { ProfileData } from "./profile";
import { STYLE_RULES } from "./style-guide";

export interface OutreachDraft {
  subject: string;
  body: string;
}

export function outreachPrompt(
  resume: ResumeData,
  jdText: string,
  company: string,
  title: string,
  profile: ProfileData | null
): string {
  const name = resume.contact?.name || profile?.targetRole || "the candidate";
  const links = (resume.contact?.links || []).join(", ");
  return `Write a short, personalized cold outreach email from a job seeker to a recruiter or hiring manager about a specific role. Keep it concise (under ~150 words), specific, and human — reference 1-2 concrete, relevant accomplishments from the resume that map to the job.

${STYLE_RULES}

Candidate name: ${name}
${links ? `Candidate links: ${links}` : ""}
Role: ${title} at ${company}

Job description:
"""
${jdText.slice(0, 4000)}
"""

Candidate resume (structured JSON):
${JSON.stringify({ summary: resume.summary, experience: resume.experience, skills: resume.skills }, null, 2)}

Return ONLY a JSON object with this exact shape:
{
  "subject": string,
  "body": string
}

The body should be plain text with line breaks, signed with the candidate's name. Do not invent accomplishments not in the resume.`;
}

/** Build a mailto: link the user's own mail client can open (nothing is sent). */
export function buildMailto(draft: OutreachDraft, to?: string): string {
  const params = new URLSearchParams();
  params.set("subject", draft.subject);
  params.set("body", draft.body);
  // URLSearchParams encodes spaces as "+"; mail clients want %20.
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${to || ""}?${query}`;
}

/**
 * A LinkedIn people-search URL to *find* a recruiter/hiring manager to message
 * yourself. Just opens a search — no automated connecting or messaging (that
 * would violate LinkedIn's ToS); you copy the draft and send it manually.
 */
export function buildLinkedInSearch(company: string): string {
  const keywords = `${company} recruiter`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords
  )}`;
}
