import { ResumeData } from "./resume";

const LT_ENDPOINT = "https://api.languagetool.org/v2/check";

interface LTMatch {
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { category: { id: string } };
}

/** Categories where the top suggestion is safe to auto-apply even if LT offers alternates (e.g. misspellings have one obvious fix). */
const AUTO_TOP_SUGGESTION_CATEGORIES = new Set(["TYPOS"]);

/** Categories where an unambiguous (single-suggestion) match is safe to auto-apply. */
const AUTO_SINGLE_SUGGESTION_CATEGORIES = new Set(["GRAMMAR", "PUNCTUATION", "CASING", "TYPOGRAPHY"]);

/**
 * Run a block of prose through LanguageTool's public API and auto-apply
 * high-confidence single-suggestion corrections (typos, grammar, punctuation,
 * casing). Style-only suggestions are left alone. Falls back to the original
 * text on any error so a grammar check never blocks generation.
 */
export async function correctGrammar(text: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    const res = await fetch(LT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "en-US" }),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as { matches?: LTMatch[] };
    const matches = (data.matches ?? [])
      .filter((m) => {
        const category = m.rule?.category?.id;
        if (!m.replacements?.length) return false;
        if (AUTO_TOP_SUGGESTION_CATEGORIES.has(category)) return true;
        return AUTO_SINGLE_SUGGESTION_CATEGORIES.has(category) && m.replacements.length === 1;
      })
      .sort((a, b) => b.offset - a.offset);

    let result = text;
    for (const m of matches) {
      result = result.slice(0, m.offset) + m.replacements[0].value + result.slice(m.offset + m.length);
    }
    return result;
  } catch {
    return text;
  }
}

const BATCH_SEP = "\n<<<LT_SPLIT>>>\n";

/**
 * Grammar-check a batch of independent prose strings (e.g. resume bullets) in
 * a single API call, preserving their boundaries. Falls back to the original
 * strings if anything looks off.
 */
async function correctGrammarBatch(items: string[]): Promise<string[]> {
  if (items.length === 0 || items.every((s) => !s.trim())) return items;
  const joined = items.join(BATCH_SEP);
  const corrected = await correctGrammar(joined);
  const parts = corrected.split(BATCH_SEP);
  if (parts.length !== items.length) return items;
  return parts;
}

/**
 * Grammar-check only the prose content of a resume (summary + experience /
 * project / activity bullets) via LanguageTool, leaving every other field
 * (contact info, names, dates, companies, schools, skills lists, etc.)
 * untouched and never sent to LanguageTool.
 */
export async function correctResumeGrammar(resume: ResumeData): Promise<ResumeData> {
  const prose: string[] = [resume.summary ?? ""];
  const positions: (
    | { kind: "summary" }
    | { kind: "exp"; i: number; j: number }
    | { kind: "proj"; i: number; j: number }
    | { kind: "act"; i: number; j: number }
  )[] = [{ kind: "summary" }];

  resume.experience.forEach((exp, i) =>
    exp.bullets.forEach((b, j) => {
      prose.push(b);
      positions.push({ kind: "exp", i, j });
    })
  );
  resume.projects.forEach((proj, i) =>
    proj.bullets.forEach((b, j) => {
      prose.push(b);
      positions.push({ kind: "proj", i, j });
    })
  );
  resume.activities.forEach((act, i) =>
    act.bullets.forEach((b, j) => {
      prose.push(b);
      positions.push({ kind: "act", i, j });
    })
  );

  const corrected = await correctGrammarBatch(prose);

  const result: ResumeData = {
    ...resume,
    experience: resume.experience.map((exp) => ({ ...exp, bullets: [...exp.bullets] })),
    projects: resume.projects.map((proj) => ({ ...proj, bullets: [...proj.bullets] })),
    activities: resume.activities.map((act) => ({ ...act, bullets: [...act.bullets] })),
  };

  positions.forEach((pos, idx) => {
    const value = corrected[idx];
    if (pos.kind === "summary") {
      result.summary = value;
    } else if (pos.kind === "exp") {
      result.experience[pos.i].bullets[pos.j] = value;
    } else if (pos.kind === "proj") {
      result.projects[pos.i].bullets[pos.j] = value;
    } else {
      result.activities[pos.i].bullets[pos.j] = value;
    }
  });

  return result;
}
