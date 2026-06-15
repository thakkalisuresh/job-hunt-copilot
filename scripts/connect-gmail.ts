/**
 * One-time Gmail OAuth handshake (BACKLOG feature A — Gmail connector).
 *
 * Run `npm run connect-gmail` after adding GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * (from a Google Cloud "Desktop app" OAuth client) to `.env.local`. This opens a
 * browser for you to sign in and grant read + send Gmail access, then prints a
 * refresh token to paste into `.env.local` as GOOGLE_REFRESH_TOKEN.
 *
 * Re-run this (even if already connected) to upgrade an existing read-only
 * refresh token to one that also covers gmail.send for the outreach feature —
 * Google will prompt for the additional permission.
 *
 * OAuth only — this never sees or asks for your Gmail password.
 */
import http from "http";
import { exec } from "child_process";
import { getOAuth2Client, GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE } from "../src/lib/gmail";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall through — the error below will explain what's missing
}

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    // Best-effort; the URL is printed below regardless.
  });
}

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local.\n" +
        "Create a Desktop-app OAuth client in Google Cloud Console and paste both values into .env.local first."
    );
    process.exit(1);
  }

  const oauth2Client = getOAuth2Client(REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh token even on repeat runs
    scope: [GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE],
  });

  console.log("Opening your browser to grant read + send Gmail access…");
  console.log("If it doesn't open automatically, visit:\n");
  console.log(authUrl + "\n");
  openBrowser(authUrl);

  const code = await waitForCode();

  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: REDIRECT_URI });

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token returned. This usually means you've already authorized this app before.\n" +
        "Go to https://myaccount.google.com/permissions, remove access for this app, then re-run `npm run connect-gmail`."
    );
    process.exit(1);
  }

  console.log("\nSuccess! Add these to .env.local:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(
    "\n(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET should already be in .env.local.)"
  );
  console.log(
    "\nReminder: while the OAuth consent screen is in \"Testing\", Google expires this " +
      "refresh token after ~7 days. Publish the app (stays unverified, fine for personal " +
      "use) in Google Cloud Console > OAuth consent screen for a long-lived token."
  );
}

/** Spin up a one-shot local server to catch the OAuth redirect and grab `code`. */
function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      if (code) {
        res.end("<html><body>Gmail connected — you can close this tab and return to the terminal.</body></html>");
      } else {
        res.end(`<html><body>Authorization failed: ${error ?? "unknown error"}. You can close this tab.</body></html>`);
      }

      server.close();
      if (code) resolve(code);
      else reject(new Error(`Authorization failed: ${error ?? "unknown error"}`));
    });

    server.listen(PORT, "127.0.0.1");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
