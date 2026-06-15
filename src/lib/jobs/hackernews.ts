import { NormalizedJob } from "./types";
import { htmlToText, inferRemoteType } from "./html";

interface AlgoliaStory {
  objectID: string;
  title: string;
  created_at_i: number;
}

interface AlgoliaComment {
  objectID: string;
  comment_text?: string;
  created_at_i?: number;
}

/**
 * Hacker News "Who is hiring?" monthly thread via the Algolia API.
 * Top-level comments are individual postings; they usually follow the loose
 * convention "Company | Role | Location | (Remote/Onsite) | ...".
 */
export async function fetchHackerNews(limit = 40): Promise<NormalizedJob[]> {
  const storyRes = await fetch(
    "https://hn.algolia.com/api/v1/search?query=Ask%20HN%20Who%20is%20hiring&tags=story&hitsPerPage=1"
  );
  if (!storyRes.ok) throw new Error(`HN story search: HTTP ${storyRes.status}`);
  const storyData = (await storyRes.json()) as { hits?: AlgoliaStory[] };
  const story = storyData.hits?.[0];
  if (!story) return [];

  const commentsRes = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=${limit}`
  );
  if (!commentsRes.ok) throw new Error(`HN comments: HTTP ${commentsRes.status}`);
  const commentsData = (await commentsRes.json()) as { hits?: AlgoliaComment[] };

  const jobs: NormalizedJob[] = [];
  for (const c of commentsData.hits || []) {
    if (!c.comment_text) continue;
    const text = htmlToText(c.comment_text);
    if (text.length < 40) continue; // skip "thanks"/meta replies
    const firstLine = text.split("\n")[0];
    const parts = firstLine.split("|").map((p) => p.trim());
    const company = parts[0] || "Unknown (HN)";
    const title = parts[1] || firstLine.slice(0, 80);
    const location = parts.slice(2).join(" · ") || null;
    jobs.push({
      source: "hackernews",
      company: company.slice(0, 120),
      title: title.slice(0, 160),
      location,
      remoteType: inferRemoteType(firstLine),
      postedDate: c.created_at_i
        ? new Date(c.created_at_i * 1000).toISOString()
        : null,
      jdText: text,
      url: `https://news.ycombinator.com/item?id=${c.objectID}`,
      salaryRange: null,
    });
  }
  return jobs;
}
