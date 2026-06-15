import { completeJson } from "./llm";

export interface ResumeExperience {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

export interface ResumeProject {
  name: string;
  organization?: string;
  date?: string;
  bullets: string[];
}

export interface ResumeActivity {
  title: string;
  organization?: string;
  date?: string;
  bullets: string[];
}

export interface ResumeData {
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    links: string[];
  };
  summary?: string;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  skills: string[];
  certifications: string[];
  awards: string[];
  languages: string[];
  activities: ResumeActivity[];
}

export const EMPTY_RESUME: ResumeData = {
  contact: { links: [] },
  summary: "",
  experience: [],
  projects: [],
  education: [],
  skills: [],
  certifications: [],
  awards: [],
  languages: [],
  activities: [],
};

/** Extract raw text from an uploaded resume file (PDF, DOCX, or plain text). */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString("utf-8");
}

const STRUCTURE_PROMPT = (rawText: string) => `You are parsing a resume into structured JSON for a job-search app.

Resume text:
"""
${rawText}
"""

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
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

Rules:
- Preserve the original wording of bullets and summary; do not invent content. (Wrapping a metric in ** is emphasis, not a wording change — it is allowed and encouraged.)
- In bullets, wrap each quantified result/metric in **double asterisks** so it renders bold — e.g. "reducing TAT by **33% (from 72 to 48 hours)**" or "mentored **15+ associates**". Bold only the number/metric phrase, never the whole bullet.
- Use "" for unknown string fields and [] for unknown lists.
- "links" should include LinkedIn/GitHub/portfolio URLs found in the resume.
- "projects" = academic/personal/side projects (not jobs). "activities" = extracurricular, volunteer, or leadership sections.
- "certifications", "awards", and "languages" each become a list of short strings; pull them out of any "Additional Skills"/"Skills" block so they aren't lost.
- Capture every section — do not drop projects, certifications, awards, languages, or activities.`;

/** Use Claude to turn raw resume text into the structured ResumeData shape. */
export async function structureResume(rawText: string): Promise<ResumeData> {
  const data = await completeJson<ResumeData>(STRUCTURE_PROMPT(rawText));
  return {
    contact: {
      name: data.contact?.name || "",
      email: data.contact?.email || "",
      phone: data.contact?.phone || "",
      location: data.contact?.location || "",
      links: data.contact?.links || [],
    },
    summary: data.summary || "",
    experience: data.experience || [],
    projects: data.projects || [],
    education: data.education || [],
    skills: data.skills || [],
    certifications: data.certifications || [],
    awards: data.awards || [],
    languages: data.languages || [],
    activities: data.activities || [],
  };
}
