# Session hand-off (2026-06-15)

## Where we are
Building **Job Hunt Copilot** at `~/Downloads/Claude/Projects/job-hunt-copilot` (Next.js 16 / React 19 / TS / Tailwind, `better-sqlite3` at `data/app.db`). All 7 original phases are built. Recent work: resume-template polish, email triage core, and now the **Gmail connector**.

## Current task: Gmail connector — DONE, OAuth connected and verified live
`.env.local` has real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`. `npm run poll-gmail` was run against the real inbox: found 6 messages (last 7 days), all correctly classified as `other` (Google account-setup emails, no tracker-relevant content yet), logged to `email_triage_log`, none auto-applied.

✅ App published in Google Cloud Console — refresh token is long-lived, no 7-day expiry to worry about.

`scripts/install-schedule.ts` now supports both jobs: `npm run install-schedule -- poll-gmail [minutes]` (default 30 min, uses `StartInterval`) and `npm run install-schedule [hour] [minute]` (refresh-feed, daily, unchanged). Generated `scripts/com.jobhuntcopilot.pollgmail.plist` (every 30 min) and `scripts/com.jobhuntcopilot.refresh.plist`. **Not yet installed** — the user still needs to run the printed `cp` + `launchctl load` commands for each plist (the script intentionally never calls launchctl itself).

Built this session (verified: `npm run build` = 0, eslint clean, scripts run via `node --import tsx`):
- `scripts/connect-gmail.ts` — one-time local OAuth handshake (loopback redirect on `http://127.0.0.1:53682`). Opens a browser, asks for `gmail.readonly` consent, prints a refresh token. Run via `npm run connect-gmail`.
- `src/lib/gmail.ts` — read-only Gmail client (`googleapis`). `listMessageIds(query)`, `getMessage(id)` (parses From/Subject/Date + decodes plain-text or HTML-stripped body), `hasGmailCredentials()`.
- `scripts/poll-gmail.ts` (`npm run poll-gmail`) — pulls messages from the last 7 days, runs each new one through the existing `email-triage` logic, auto-applies the tracker status when confident, and logs every result (applied or not) to a new `email_triage_log` table for provenance / future review-queue UI. Dedupes by Gmail message id so re-runs are cheap and safe.
- DB: added `email_triage_log` table to `src/lib/db.ts` (gmail_message_id, classification, match, suggested_status, applied flag).
- `.env.local` / `.env.local.example`: added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

**Hard rule honored:** OAuth only, never asks for/accepts the Gmail password. Scope = `gmail.readonly`. Tokens live only in `.env.local`.

### What's left — next backlog items
1. User runs the `cp` + `launchctl load` commands printed by `install-schedule` to actually activate the `poll-gmail` (every 30 min) and `refresh-feed` (daily 8am) launch agents.
2. Review-queue UI (backlog item 2): surface `email_triage_log` rows where `applied = 0` on the dashboard.

## Remaining backlog (see `BACKLOG.md`)
Review-queue dashboard UI (surface `email_triage_log` rows where `applied = 0`) → browser-extension Gmail/LinkedIn feed → Gmail send (per-message confirm). LinkedIn = pre-fill + user-clicks-send only (automation violates ToS).

## Environment quirks (important)
- **Node via nvm**: prefix Bash with `source ~/.zshrc`. No Homebrew/system node.
- **`source ~/.zshrc` itself exits 126** (a harmless zsh `compdef` warning) — chain subsequent commands with `;`, not `&&`, or they'll be skipped.
- **Dev server is broken in this environment** (Turbopack spawns a node subprocess that can't find node). **`npm run build` works** — use it to verify Next routes/pages. Verify libs via `node --import tsx <script>` (redirect output to a file; piping to `tail` can give a spurious exit 126; run WITHOUT `dangerouslyDisableSandbox`).
- **PDF visual checks**: render with system PyMuPDF — `/usr/bin/python3 -c "import fitz; ..."` (matrix 2.2). DOCX preview via `qlmanage -t -s 1600 -o /tmp <file>`.
- **AGENTS.md / CLAUDE.md**: read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code (this is a modified Next.js).
- Master resume is seeded via `node --import tsx scripts/seed-my-resume.ts` (regenerates `samples/`). Master = Sabarish Nair (real resume + UW Masters).

## Key decisions to honor
Human-in-the-loop on every outbound send and ambiguous status change. No accounts/passwords handled by the assistant. Read-only Gmail scope first. Auto-when-confident + review queue (now persisted in `email_triage_log`). Resume font = Arial; A4; Experience before Education; both must fit page 1 (warn, don't shrink).
