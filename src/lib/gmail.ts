import { google } from "googleapis";

/**
 * Read-only Gmail client (BACKLOG feature A). Auth comes from a one-time OAuth
 * handshake (`npm run connect-gmail`, see scripts/connect-gmail.ts) whose
 * refresh token is stored in `.env.local`. Scope: gmail.readonly.
 */

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

/** Whether the three Gmail OAuth env vars are configured. */
export function hasGmailCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function getOAuth2Client(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Add them to .env.local (from the Google Cloud OAuth client)."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getGmailClient() {
  if (!hasGmailCredentials()) {
    throw new Error(
      "Gmail is not connected. Run `npm run connect-gmail` and add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN to .env.local."
    );
  }
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

/** List message ids matching a Gmail search query (e.g. `newer_than:1d`). */
export async function listMessageIds(
  query: string,
  maxResults = 25
): Promise<string[]> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

interface GmailPart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
}

/** Walk a (possibly multipart) message body, preferring text/plain over text/html. */
function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";

  let plain = "";
  let html = "";

  function walk(p: GmailPart) {
    const mime = p.mimeType ?? "";
    if (mime === "text/plain" && p.body?.data) {
      plain += decodeBase64Url(p.body.data);
    } else if (mime === "text/html" && p.body?.data) {
      html += decodeBase64Url(p.body.data);
    } else if (p.parts) {
      for (const child of p.parts) walk(child);
    } else if (!mime.startsWith("multipart/") && p.body?.data) {
      plain += decodeBase64Url(p.body.data);
    }
  }

  walk(part);
  return plain.trim() || stripHtml(html);
}

/** Fetch and parse a single message: sender, subject, date, plain-text body. */
export async function getMessage(id: string): Promise<GmailMessage> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });

  const headers = res.data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    id: res.data.id ?? id,
    threadId: res.data.threadId ?? "",
    from: header("From"),
    subject: header("Subject"),
    date: header("Date"),
    body: extractBody(res.data.payload as GmailPart | undefined),
  };
}
