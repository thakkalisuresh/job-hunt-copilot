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
];

/** A prompt fragment enforcing tone/phrasing rules. Append to any generation prompt. */
export const STYLE_RULES = `Writing style rules (apply to every sentence):
- Plain, direct American English. No corporate jargon, buzzwords, or filler.
- Active voice. Concrete nouns and verbs, not vague adjectives.
- No exclamation points.
- Vary sentence length, but keep most sentences short and concrete.
- Never use any of these words/phrases or close variants of them: ${BANNED_PHRASES.join(", ")}.`;
