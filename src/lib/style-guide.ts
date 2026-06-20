import { completeJson } from "./llm";
import { LlmProvider } from "./providers/types";

/**
 * Shared writing-style constraints injected into prompts that generate
 * resume bullets (Rewriter) and outreach emails, so both read like the same
 * person wrote them and avoid common AI-generated tells.
 */

export const BANNED_PHRASES = [
  "synergy",
  "synergize",
  "synergistic",
  "passionate about",
  "passion for",
  "leverage",
  "leveraging",
  "utilize",
  "utilization",
  "dynamic",
  "go-getter",
  "results-driven",
  "self-starter",
  "team player",
  "think outside the box",
  "wheelhouse",
  "circle back",
  "touch base",
  "low-hanging fruit",
  "game-changer",
  "game changing",
  "cutting-edge",
  "best-in-class",
  "world-class",
  "rockstar",
  "ninja",
  "guru",
  "I am writing to express my interest",
  "I am excited to apply",
  "thrilled to",
  "trusted advisor",
  "value-add",
  "deep dive",
  "drill down",
  "at the end of the day",
  "move the needle",
  "needle mover",
  "I hope this email finds you well",
  "in today's fast-paced",
  "in today's competitive",
  "it's important to note",
  "in conclusion",
  "needless to say",
];

/** A prompt fragment enforcing tone/phrasing rules. Append to any generation prompt. */
export const STYLE_RULES = `Writing style rules (apply to every sentence):
- Plain, direct American English. No corporate jargon, buzzwords, or filler.
- Active voice. Concrete nouns and verbs, not vague adjectives.
- No exclamation points.
- NEVER use an em dash (—) or double hyphen (--), under any circumstances. Use a period, comma, or parentheses instead. This applies to every sentence with no exceptions.
- Avoid formulaic AI-sounding transitions ("Furthermore,", "Moreover,", "Additionally,", "Overall,").
- Don't default to lists of exactly three items or perfectly parallel/symmetric sentence structures — real writing is uneven. Vary sentence length and structure noticeably.
- Contractions (I've, don't, it's) are fine and often sound more natural.
- Never use any of these words/phrases or close variants of them: ${BANNED_PHRASES.join(", ")}.`;

const EM_DASH_RE = /\s*(?:—|--)\s*/g;

/** Defense-in-depth: strip any em dashes the model used despite STYLE_RULES. */
export function stripEmDashes(text: string): string {
  return text
    .replace(EM_DASH_RE, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?:;])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Recursively apply stripEmDashes to every string value in an object/array. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stripEmDashes(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDeep(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDeep(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Second-pass LLM self-review: re-reads generated JSON content against
 * STYLE_RULES and fixes any violations (stock phrases, em dashes, robotic
 * rhythm) without changing facts, structure, or keys. Falls back to the
 * original content if the review call fails or returns malformed JSON, so
 * a style nit never blocks generation.
 */
export async function reviewWritingStyle<T>(
  label: string,
  content: T,
  provider?: LlmProvider
): Promise<T> {
  const prompt = `You previously generated the following ${label}. Re-read it against these writing style rules and fix ONLY style-rule violations. Do not change facts, structure, JSON keys, array lengths, numbers, dates, or meaning otherwise.

${STYLE_RULES}

Content to review (JSON):
${JSON.stringify(content, null, 2)}

Return ONLY the corrected JSON, in the exact same shape as the input (same keys, same nesting, same array lengths). If there are no violations, return it unchanged.`;

  try {
    return await completeJson<T>(prompt, undefined, provider);
  } catch {
    return content;
  }
}
