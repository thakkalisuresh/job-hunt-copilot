# Session hand-off (2026-06-15)

## Where we are
Building **Job Hunt Copilot** at `~/Downloads/Claude/Projects/job-hunt-copilot` (Next.js 16 / React 19 / TS / Tailwind, `better-sqlite3` at `data/app.db`). All 7 original phases are built. Recent work: resume-template polish, email triage core, the **Gmail connector**, **Gmail send for outreach**, and a shared **writing style guide**.

## Writing style guide — DONE
`src/lib/style-guide.ts` is the single source of truth for resume/outreach tone, used by both the XYZ Rewriter prompt and the outreach email prompt:
- `BANNED_PHRASES` — ~35 AI-cliché words/phrases ("synergy", "leverage", "I am writing to express my interest", "in conclusion", etc.)
- `STYLE_RULES` — plain American English, active voice, no exclamation points, **no em dashes ever** (en dashes are fine — user confirmed), avoid formulaic transitions/rule-of-three/robotic symmetry, contractions OK.
- `sanitizeDeep()` — mechanical backstop that strips any em dash (`—` or `--`) from every string in the generated JSON, regardless of prompt compliance.
- `reviewWritingStyle()` — second LLM pass that re-reads the generated tailored resume / outreach draft against `STYLE_RULES` and fixes violations (facts/structure preserved), falling back to the original on failure.
- `src/lib/language-tool.ts` — third pass, grammar-only: calls LanguageTool's public API and auto-applies high-confidence typo/grammar/punctuation/casing fixes. `correctResumeGrammar()` checks only the resume's `summary` + bullet arrays (never contact info, names, dates, company/school names); `correctGrammar()` checks only the outreach email `body` (never the subject). Nothing else is ever sent to LanguageTool.
- Pipeline order in both `pipeline/route.ts` (rewrite step) and `outreach/route.ts`: `reviewWritingStyle()` → LanguageTool grammar pass → `sanitizeDeep()` (final em-dash backstop).
- Verified end-to-end on a real application: regenerated outreach draft had no em dashes, natural contractions, no banned phrases. LanguageTool pass verified live against the real API (typos, apostrophe misuse, sentence-start casing all auto-fixed; company/contact fields untouched).

## Current task: Gmail connector — DONE, OAuth connected and verified live
`.env.local` has real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`. `npm run poll-gmail` was run against the real inbox: found 6 messages (last 7 days), all correctly classified as `other` (Google account-setup emails, no tracker-relevant content yet), logged to `email_triage_log`, none auto-applied.

✅ App published in Google Cloud Console (confirmed by user — hit Publish on the OAuth consent screen, not just left in Testing) — refresh token is long-lived, no 7-day expiry to worry about.

✅ GitHub account `thakkalisuresh` confirmed by user to be their own account — the private repo push is fine.

`scripts/install-schedule.ts` now supports both jobs: `npm run install-schedule -- poll-gmail [minutes]` (default 30 min, uses `StartInterval`) and `npm run install-schedule [hour] [minute]` (refresh-feed, daily, unchanged). Generated `scripts/com.jobhuntcopilot.pollgmail.plist` (every 30 min) and `scripts/com.jobhuntcopilot.refresh.plist`. **Not yet installed** — the user still needs to run the printed `cp` + `launchctl load` commands for each plist (the script intentionally never calls launchctl itself).

Built this session (verified: `npm run build` = 0, eslint clean, scripts run via `node --import tsx`):
- `scripts/connect-gmail.ts` — one-time local OAuth handshake (loopback redirect on `http://127.0.0.1:53682`). Opens a browser, asks for `gmail.readonly` consent, prints a refresh token. Run via `npm run connect-gmail`.
- `src/lib/gmail.ts` — read-only Gmail client (`googleapis`). `listMessageIds(query)`, `getMessage(id)` (parses From/Subject/Date + decodes plain-text or HTML-stripped body), `hasGmailCredentials()`.
- `scripts/poll-gmail.ts` (`npm run poll-gmail`) — pulls messages from the last 7 days, runs each new one through the existing `email-triage` logic, auto-applies the tracker status when confident, and logs every result (applied or not) to a new `email_triage_log` table for provenance / future review-queue UI. Dedupes by Gmail message id so re-runs are cheap and safe.
- DB: added `email_triage_log` table to `src/lib/db.ts` (gmail_message_id, classification, match, suggested_status, applied flag).
- `.env.local` / `.env.local.example`: added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

**Hard rule honored:** OAuth only, never asks for/accepts the Gmail password. Scope = `gmail.readonly`. Tokens live only in `.env.local`.

## Review queue UI — DONE
Added a "Needs review" panel to the dashboard (`src/app/page.tsx`):
- `GET /api/email/triage/review` (`src/app/api/email/triage/review/route.ts`) — lists `email_triage_log` rows where `applied=0 AND dismissed=0 AND suggested_status IS NOT NULL`, joined to the matched application's company/title.
- `PATCH /api/email/triage/review/[id]` (`src/app/api/email/triage/review/[id]/route.ts`) — body `{ action: "confirm" | "dismiss" }`. `confirm` applies the suggested status to the matched application + sets `applied=1`; `dismiss` sets `dismissed=1` (no tracker change).
- DB: added `dismissed INTEGER NOT NULL DEFAULT 0` to `email_triage_log` (migration + schema).
- Verified end-to-end via browser preview: seeded two fake triage rows, confirmed one (moved a card between columns and removed it from the queue) and dismissed the other (queue emptied, panel disappears). Test rows cleaned up afterward and the real application's status was restored.
- Note: **the dev server actually works via `preview_start`** in this environment (contrary to the old note below) — `.claude/launch.json` now exists with a `job-hunt-copilot` config on port 3000.

## Email-triage matching — role title weighted up
`matchApplication` in `src/lib/email-triage.ts` now scores a role-title match in the email body as +2 (was +1), same as a company-name match. Rationale: ATS senders (Greenhouse, Workday, Lever) rarely match the company's domain, but their templates almost always restate both the company and the role — so company+title in body now scores 4 (confidently auto-applies), while a title-only match scores 2 (stays in the review queue, avoiding ambiguity across same-titled roles at different companies). Verified with a scenario script; pushed as `18f7ff4`.

## Browser extension — Gmail triage + outreach pre-fill — DONE
`extension/` (v0.2.0): "Triage this email" reads the open Gmail message's sender/subject/body (DOM scrape via `activeTab`/`scripting`, no new permissions) and posts to `POST /api/email/triage` with `apply: true` — same classifier as the poller, auto-applies when confident, else shows up in "Needs review". "Fill compose / DM here" writes a saved outreach draft's subject/body into an open Gmail compose box or LinkedIn message box (`/api/jobs` now also returns `recruiter_email`). Never sends/submits. `npm run build` + `npm run lint` clean.

### What's left — next backlog items
None currently queued — all BACKLOG items shipped. Open question: confirm OAuth consent screen is "In production" (✅ confirmed by user 2026-06-15 via Cloud Console — "back to testing" button shown, meaning it's currently published).

## Launchd schedules — ACTIVE
Both `com.jobhuntcopilot.pollgmail` (every 30 min) and `com.jobhuntcopilot.refresh` (daily 08:00) are loaded and running (`launchctl list | grep jobhuntcopilot`). poll-gmail has already completed multiple clean runs; refresh-feed completed its first run (50 jobs added, 47/50 enriched — 3 hit a transient Anthropic 429 rate limit, harmless, will retry next run). The "Load failed: 5: Input/output error" message from `launchctl load` on modern macOS is cosmetic — the job loads fine despite it.

## Remaining backlog (see `BACKLOG.md`)
Browser-extension Gmail/LinkedIn feed → Gmail send (per-message confirm). LinkedIn = pre-fill + user-clicks-send only (automation violates ToS).

## Environment quirks (important)
- **Node via nvm**: prefix Bash with `source ~/.zshrc`. No Homebrew/system node.
- **`source ~/.zshrc` itself exits 126** (a harmless zsh `compdef` warning) — chain subsequent commands with `;`, not `&&`, or they'll be skipped.
- **Dev server is broken in this environment** (Turbopack spawns a node subprocess that can't find node). **`npm run build` works** — use it to verify Next routes/pages. Verify libs via `node --import tsx <script>` (redirect output to a file; piping to `tail` can give a spurious exit 126; run WITHOUT `dangerouslyDisableSandbox`).
- **PDF visual checks**: render with system PyMuPDF — `/usr/bin/python3 -c "import fitz; ..."` (matrix 2.2). DOCX preview via `qlmanage -t -s 1600 -o /tmp <file>`.
- **AGENTS.md / CLAUDE.md**: read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code (this is a modified Next.js).
- Master resume is seeded via `node --import tsx scripts/seed-my-resume.ts` (regenerates `samples/`). Master = Sabarish Nair (real resume + UW Masters).

## Key decisions to honor
Human-in-the-loop on every outbound send and ambiguous status change. No accounts/passwords handled by the assistant. Read-only Gmail scope first. Auto-when-confident + review queue (now persisted in `email_triage_log`). Resume font = Arial; A4; Experience before Education; both must fit page 1 (warn, don't shrink).
