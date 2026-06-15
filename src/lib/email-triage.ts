import { completeJson } from "./llm";

/**
 * Email-driven tracker updates (BACKLOG feature A), provider-agnostic core.
 * Pure matcher + LLM classifier here; a Gmail connector (OAuth, user-supplied
 * credentials) or the browser extension feeds emails into `POST /api/email/triage`.
 */

export type EmailCategory =
  | "confirmation" // application received / under review
  | "interview_request"
  | "info_request" // they need more info / an action from you
  | "rejection"
  | "offer"
  | "other";

export interface EmailClassification {
  category: EmailCategory;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface MatchableApplication {
  id: number;
  company: string;
  title: string;
}

// Which tracker status each category maps to (null = no status change).
const CATEGORY_TO_STATUS: Record<EmailCategory, string | null> = {
  confirmation: "applied",
  interview_request: "interview_requested",
  info_request: "action_needed",
  rejection: "rejected",
  offer: "offer",
  other: null,
};

export function categoryToStatus(category: EmailCategory): string | null {
  return CATEGORY_TO_STATUS[category];
}

/**
 * Heuristic match of an email to an application by company-name overlap in the
 * sender domain / subject / body. Returns the best candidate + a score (higher =
 * more confident); null if nothing plausible. Deterministic and unit-testable.
 */
export function matchApplication(
  email: { from: string; subject: string; body: string },
  apps: MatchableApplication[]
): { applicationId: number; score: number } | null {
  const hay = `${email.from} ${email.subject} ${email.body}`.toLowerCase();
  const domain = (email.from.split("@")[1] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let best: { applicationId: number; score: number } | null = null;
  for (const app of apps) {
    const company = app.company.toLowerCase().trim();
    if (!company) continue;
    const compToken = company.replace(/[^a-z0-9]/g, "");
    let score = 0;
    if (compToken && domain.includes(compToken)) score += 3; // strong: sender domain
    if (hay.includes(company)) score += 2; // company name anywhere
    if (app.title && hay.includes(app.title.toLowerCase())) score += 1; // role title
    if (score > 0 && (!best || score > best.score)) {
      best = { applicationId: app.id, score };
    }
  }
  return best;
}

const classifyPrompt = (email: { from: string; subject: string; body: string }) =>
  `You triage a job-seeker's inbox. Classify this email about a job application.

From: ${email.from}
Subject: ${email.subject}
Body:
"""
${email.body}
"""

Categories:
- "confirmation": application received / being reviewed, no action needed
- "interview_request": they want to schedule or invite to an interview / screen
- "info_request": they need more information or an action from the candidate
- "rejection": not moving forward
- "offer": a job offer
- "other": newsletters, alerts, anything not about a specific application's status

Return ONLY JSON: { "category": one of the above, "confidence": "high"|"medium"|"low", "reason": short string }`;

export async function classifyEmail(email: {
  from: string;
  subject: string;
  body: string;
}): Promise<EmailClassification> {
  return completeJson<EmailClassification>(classifyPrompt(email));
}

/**
 * A triage result is "confident enough" to auto-apply only when the classifier
 * is sure, the email maps to a status, and the sender clearly matches one app.
 * Everything else goes to the review queue (auto-when-confident, ask-when-not).
 */
export function isConfident(
  classification: EmailClassification,
  match: { score: number } | null,
  status: string | null
): boolean {
  return (
    classification.confidence === "high" && !!status && !!match && match.score >= 3
  );
}
