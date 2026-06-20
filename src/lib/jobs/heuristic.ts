import { ResumeData } from "../resume";
import { JobEnrichment, NormalizedJob } from "./types";

/**
 * Offline, no-LLM job enrichment. Used as a fallback when no LLM key is set or
 * the provider call fails (rate limit / out of credits), so the feed always
 * gets a fit signal without an external API call.
 *
 * Scoring is domain-driven, not literal-word-driven: we infer the candidate's
 * professional domain(s) from their *experience titles* (e.g. "HR Analyst" ->
 * the HR/People domain) and score a job by whether its title sits in the same
 * domain. This avoids two failure modes of naive keyword overlap: HR-synonym
 * titles ("Human Resources Associate" vs a resume that says "HR") scoring zero,
 * and generic tool skills (Excel, SQL) inflating unrelated engineering roles.
 *
 * Summaries are prefixed "Offline estimate:" so they're distinguishable from
 * LLM-written ones in the UI. The DOL known-sponsor override is applied by the
 * caller (enrichJob), same as the LLM path.
 */

/** Title keywords that define each professional domain. Multi-word entries are
 *  matched as substrings; single tokens are matched as whole words. */
const DOMAIN_LEXICONS: Record<string, string[]> = {
  hr: [
    "hr", "human resources", "people", "people operations", "talent",
    "talent acquisition", "recruiter", "recruiting", "recruitment", "sourcer",
    "hrbp", "business partner", "learning", "l&d", "compensation", "benefits",
    "total rewards", "employee relations", "dei", "diversity", "workforce",
    "personnel", "generalist", "people partner", "hris",
  ],
  engineering: [
    "engineer", "engineering", "software", "developer", "sre", "reliability",
    "infrastructure", "devops", "backend", "frontend", "full stack", "fullstack",
    "platform", "security", "networking", "qa", "embedded",
  ],
  sales: [
    "sales", "account executive", "account manager", "revenue",
    "business development", "quota", "sdr", "bdr", "partnerships",
  ],
  marketing: [
    "marketing", "brand", "growth", "demand generation", "content", "seo",
    "campaign", "communications", "pr",
  ],
  finance: [
    "finance", "financial", "accounting", "accountant", "audit", "fp&a",
    "controller", "tax", "treasury", "payroll",
  ],
  data: [
    "data scientist", "data analyst", "data engineer", "analytics",
    "machine learning", "ml engineer", "ai engineer", "applied scientist",
  ],
  product: [
    "product manager", "product management", "product owner", "product analyst",
    "roadmap", "product marketing",
  ],
  design: ["design", "designer", "ux", "ui", "researcher", "creative"],
  customer: [
    "customer success", "customer experience", "support", "solutions architect",
    "solutions engineer", "solutions specialist", "delivery success",
    "technical account", "implementation", "enablement",
  ],
  operations: [
    "operations", "program manager", "project manager", "business operations",
    "strategy", "chief of staff",
  ],
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#&\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** Domains whose keywords appear in a single title string. */
function domainsInTitle(title: string): Set<string> {
  const lower = title.toLowerCase();
  const tokens = tokenize(title);
  const found = new Set<string>();
  for (const [domain, keywords] of Object.entries(DOMAIN_LEXICONS)) {
    for (const kw of keywords) {
      const hit = kw.includes(" ") ? lower.includes(kw) : tokens.has(kw);
      if (hit) {
        found.add(domain);
        break;
      }
    }
  }
  return found;
}

/**
 * Candidate domain weights from experience titles, normalized to the most
 * frequent domain (primary domain = 1.0). A one-off junior role in another
 * field contributes a small weight rather than a full match.
 */
function candidateDomainWeights(resume: ResumeData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const exp of resume.experience) {
    for (const d of domainsInTitle(exp.title)) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...counts.values());
  const weights = new Map<string, number>();
  for (const [d, c] of counts) weights.set(d, c / max);
  return weights;
}

/** How many distinct resume skills are mentioned in the JD text. */
function skillOverlap(resume: ResumeData, jd: string): number {
  const lower = jd.toLowerCase();
  let hits = 0;
  for (const skill of resume.skills) {
    const s = skill.trim().toLowerCase();
    if (s.length < 2) continue;
    if (lower.includes(s)) hits++;
  }
  return hits;
}

function classifySeniority(title: string): JobEnrichment["seniorityTag"] {
  const t = title.toLowerCase();
  if (/(principal|staff|director|vp|vice president|head of|chief|\blead\b)/.test(t)) return "staff+";
  if (/(senior|\bsr\.?\b|manager|\bmgr\b)/.test(t)) return "senior";
  if (/(junior|\bjr\.?\b|intern|entry[- ]level|associate|coordinator|assistant)/.test(t)) return "junior";
  return "mid";
}

function extractMinYears(jd: string): number | null {
  // Matches "5+ years", "5-7 years", "minimum of 3 years", "at least 4 yrs".
  const m = jd.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 40 ? n : null;
}

function classifySponsorship(jd: string): JobEnrichment["sponsorshipTag"] {
  const t = jd.toLowerCase();
  if (
    /(no visa sponsorship|not able to sponsor|unable to sponsor|without sponsorship|do(?:es)? not (?:offer|provide) sponsorship|must (?:be|already be) (?:authorized|eligible to work)|cannot sponsor)/.test(t)
  ) {
    return "no";
  }
  if (/(visa sponsorship|will sponsor|sponsorship available|able to sponsor|open to sponsor)/.test(t)) {
    return "likely";
  }
  return "unclear";
}

/** Produce a JobEnrichment for one job using only local computation. */
export function enrichJobHeuristic(
  job: NormalizedJob,
  resume: ResumeData | null
): JobEnrichment {
  const seniorityTag = classifySeniority(job.title);
  const jd = job.jdText || "";
  const minYears = extractMinYears(jd);
  const sponsorshipTag = classifySponsorship(jd);

  if (!resume) {
    return { sponsorshipTag, seniorityTag, minYears, fitScore: null, fitSummary: null };
  }

  const candidateWeights = candidateDomainWeights(resume);
  const jobDomains = domainsInTitle(job.title);

  // Title score = best candidate-domain weight among the job's domains (0..1).
  let titleScore = 0;
  let matchedDomain: string | null = null;
  for (const d of jobDomains) {
    const w = candidateWeights.get(d) ?? 0;
    if (w > titleScore) {
      titleScore = w;
      matchedDomain = d;
    }
  }

  const hits = skillOverlap(resume, jd);
  const skillScore = Math.min(1, hits / Math.max(1, Math.min(4, resume.skills.length))); // 0..1

  // Title/domain dominates (70%). Generic skills only count for much when the
  // role is already in the candidate's domain — otherwise they're gated down so
  // tool overlap (Excel, SQL) can't inflate an unrelated role.
  const skillGate = titleScore > 0 ? 1 : 0.3;
  const fitScore = Math.round(titleScore * 70 + skillScore * 30 * skillGate);

  let fitSummary: string;
  if (titleScore >= 0.75) {
    fitSummary = `Offline estimate: strong match — "${job.title}" is in your ${matchedDomain?.toUpperCase()} domain${hits ? `; ${hits} resume skill(s) appear in the JD` : ""}.`;
  } else if (titleScore > 0) {
    fitSummary = `Offline estimate: partial match — "${job.title}" touches your ${matchedDomain?.toUpperCase()} background but isn't your core role.`;
  } else {
    fitSummary = `Offline estimate: low match — this ${seniorityTag} "${job.title}" role is outside your HR/People background.`;
  }

  return { sponsorshipTag, seniorityTag, minYears, fitScore, fitSummary };
}
