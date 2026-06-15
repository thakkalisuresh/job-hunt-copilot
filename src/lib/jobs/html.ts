/** Strip HTML tags and decode common entities into readable plain text. */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Best-effort remote/hybrid/onsite classification from a location string. */
export function inferRemoteType(
  location: string | null | undefined
): "remote" | "hybrid" | "onsite" | "unknown" {
  if (!location) return "unknown";
  const l = location.toLowerCase();
  if (l.includes("hybrid")) return "hybrid";
  if (l.includes("remote") || l.includes("anywhere")) return "remote";
  if (l.trim()) return "onsite";
  return "unknown";
}
