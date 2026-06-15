import { ResumeData } from "./resume";
import { STYLE_RULES } from "./style-guide";

export const PIPELINE_STEPS = [
  "diagnose",
  "keywords",
  "rewrite",
  "interview",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export interface DiagnoserIssue {
  severity: "high" | "medium" | "low";
  issue: string;
  suggestion: string;
}

export interface DiagnoserResult {
  overallAssessment: string;
  issues: DiagnoserIssue[];
}

export interface RecruiterKeyword {
  keyword: string;
  importance: "high" | "medium" | "low";
  whereToAdd: string;
}

export interface RecruiterResult {
  summary: string;
  matchedKeywords: string[];
  missingKeywords: RecruiterKeyword[];
}

export interface RewriterBulletDiff {
  company: string;
  title: string;
  before: string;
  after: string;
  rationale: string;
}

export interface RewriterResult {
  summaryOfChanges: string;
  bulletDiffs: RewriterBulletDiff[];
  tailoredResume: ResumeData;
}

export interface InterviewQuestion {
  question: string;
  category: string;
  whatGoodLooksLike: string;
}

export interface InterviewResult {
  questions: InterviewQuestion[];
}

export interface InterviewFeedback {
  score: number;
  strengths: string[];
  improvements: string[];
  suggestedAnswer: string;
}

const resumeBlock = (resume: ResumeData) => JSON.stringify(resume, null, 2);

export const SYSTEM_PROMPT =
  "You are a career coach and ATS/resume expert helping a job seeker tailor their resume to a specific job description. " +
  "Be concrete, honest, and specific to the resume and job description provided. Never invent experience the candidate doesn't have. " +
  "When asked for JSON, return ONLY the JSON object with no markdown fences or commentary.";

export function diagnoserPrompt(resume: ResumeData, jdText: string): string {
  return `Here is the candidate's current resume (structured JSON):
${resumeBlock(resume)}

Here is the job description they're targeting:
"""
${jdText}
"""

Step 1 - ATS Diagnoser: Analyze the resume for ATS (Applicant Tracking System) parsing and formatting issues, and how well it's positioned for this specific job. Look for things like: missing sections, vague/unquantified bullets, inconsistent date formats, missing contact info, title/seniority mismatch vs the JD, and any content gaps relative to the JD's core requirements.

Return ONLY a JSON object with this exact shape:
{
  "overallAssessment": string,
  "issues": [ { "severity": "high" | "medium" | "low", "issue": string, "suggestion": string } ]
}`;
}

export function recruiterPrompt(): string {
  return `Step 2 - Recruiter Keyword Gap Analysis: Now act as a recruiter screening this resume against the same job description. Identify the important keywords, skills, and qualifications from the JD, note which ones the resume already covers (matchedKeywords), and which important ones are missing or underrepresented (missingKeywords). For each missing keyword, suggest where in the resume it could honestly be added (only if the candidate plausibly has that experience based on their background — do not suggest fabricating skills).

Return ONLY a JSON object with this exact shape:
{
  "summary": string,
  "matchedKeywords": string[],
  "missingKeywords": [ { "keyword": string, "importance": "high" | "medium" | "low", "whereToAdd": string } ]
}`;
}

export function rewriterPrompt(): string {
  return `Step 3 - XYZ Rewriter: Using the diagnosis and keyword gaps identified above, rewrite the resume's experience bullets using the XYZ formula ("Accomplished [X] as measured by [Z], by doing [Y]"). Incorporate the missing keywords from step 2 only where they truthfully fit the candidate's existing experience — do not invent employers, titles, technologies, or metrics that weren't implied by the original resume. If a bullet has no number/result, keep it qualitative but still sharpen the action and impact language. Keep the same number of experience entries and roughly the same number of bullets per role. In every rewritten bullet, wrap the key quantified result/metric in **double asterisks** so it renders bold (e.g. "**42% faster**", "**$1.2M saved**") — bold only the metric phrase, not the whole sentence.

${STYLE_RULES}

Return ONLY a JSON object with this exact shape:
{
  "summaryOfChanges": string,
  "bulletDiffs": [ { "company": string, "title": string, "before": string, "after": string, "rationale": string } ],
  "tailoredResume": {
    "contact": { "name": string, "email": string, "phone": string, "location": string, "links": string[] },
    "summary": string,
    "experience": [ { "company": string, "title": string, "location": string, "startDate": string, "endDate": string, "bullets": string[] } ],
    "projects": [ { "name": string, "organization": string, "date": string, "bullets": string[] } ],
    "education": [ { "school": string, "degree": string, "field": string, "startDate": string, "endDate": string, "gpa": string } ],
    "skills": string[],
    "certifications": string[],
    "awards": string[],
    "languages": string[],
    "activities": [ { "title": string, "organization": string, "date": string, "bullets": string[] } ]
  }
}

The "tailoredResume" must be the FULL resume — every section and every entry from the original (experience, projects, education, skills, certifications, awards, languages, activities) — with the rewritten bullets applied. Never drop a section that exists in the original; carry projects, certifications, awards, languages, and activities through even if you don't change them.

For academic projects specifically: compare each project's bullets against the job description and rewrite a bullet ONLY when doing so genuinely improves its relevance or keyword match to this role (applying the same XYZ formula and **metric** bolding). If a project bullet is already well-aligned, or the JD offers no honest improvement, carry it through verbatim. Never invent project work or metrics.`;
}

export function interviewPrompt(): string {
  return `Step 4 - Mock Interview: Based on the tailored resume and the job description, generate 5 realistic interview questions this candidate is likely to be asked for this role. Mix behavioral and role-specific/technical questions, drawing on the candidate's actual experience and the JD's requirements. For each question, briefly describe what a strong answer would cover (whatGoodLooksLike) so the candidate knows what to aim for.

Return ONLY a JSON object with this exact shape:
{
  "questions": [ { "question": string, "category": string, "whatGoodLooksLike": string } ]
}`;
}

export function interviewFeedbackPrompt(
  question: string,
  whatGoodLooksLike: string,
  answer: string
): string {
  return `The candidate was asked this mock interview question:
"${question}"

What a strong answer covers: ${whatGoodLooksLike}

The candidate answered:
"""
${answer}
"""

Score this answer from 1-10 and give specific feedback.

Return ONLY a JSON object with this exact shape:
{
  "score": number,
  "strengths": string[],
  "improvements": string[],
  "suggestedAnswer": string
}`;
}
