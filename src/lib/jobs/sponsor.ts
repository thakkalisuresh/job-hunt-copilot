import { getDb } from "../db";

/**
 * Normalize an employer name for matching between job postings and the DOL LCA
 * dataset: uppercase, strip common suffixes and punctuation.
 */
export function normalizeEmployer(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(INC|LLC|LTD|CORP|CORPORATION|CO|COMPANY|LP|LLP|PLC|GMBH)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: Map<string, number> | null = null;

function loadCache(): Map<string, number> {
  if (cache) return cache;
  cache = new Map();
  try {
    const rows = getDb()
      .prepare("SELECT employer_name, sponsorship_count FROM sponsor_lookup")
      .all() as { employer_name: string; sponsorship_count: number }[];
    for (const r of rows) cache.set(r.employer_name, r.sponsorship_count);
  } catch {
    // table may be empty / not yet built
  }
  return cache;
}

/** Reset the in-memory cache (call after rebuilding the table). */
export function clearSponsorCache() {
  cache = null;
}

/**
 * Returns the LCA sponsorship count for an employer if it appears in the DOL
 * dataset above a small threshold, else null. Uses normalized exact match and a
 * prefix fallback (e.g. "GOOGLE" matches "GOOGLE LLC" stored as "GOOGLE").
 */
export function lookupSponsor(company: string, minCount = 5): number | null {
  const map = loadCache();
  if (map.size === 0) return null;
  const key = normalizeEmployer(company);
  if (!key) return null;
  const exact = map.get(key);
  if (exact && exact >= minCount) return exact;
  // Prefix fallback for short tokens like "stripe" vs "STRIPE PAYMENTS".
  for (const [name, count] of map) {
    if (count >= minCount && (name.startsWith(key) || key.startsWith(name))) {
      return count;
    }
  }
  return null;
}
