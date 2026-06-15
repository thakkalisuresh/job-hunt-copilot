# Backlog

## Shipped (2026-06-15)
- **Gmail connector** — `scripts/connect-gmail.ts` (OAuth loopback handshake, `npm run connect-gmail`), `src/lib/gmail.ts` (read-only client), `scripts/poll-gmail.ts` (`npm run poll-gmail`: pulls recent mail, runs the existing email-triage logic, auto-applies when confident, logs everything to the new `email_triage_log` table). OAuth connected, app published, verified against the live inbox.
- **Launchd scheduling for poll-gmail** — `scripts/install-schedule.ts` now generates a `poll-gmail` plist (every 30 min, `StartInterval`) alongside the existing `refresh-feed` plist (daily). User still needs to run the printed `cp` + `launchctl load` commands.

## Shipped (2026-06-14)
- **README "How it works"** — end-to-end flow section in `README.md`.
- **Page-2 fit warning** — dropped the silent auto-shrink; `measurePageFit` in `src/lib/resume-render.ts`; fit exposed via `/api/resume`, `/api/jobs`, `/api/applications/[id]`; non-blocking warnings on the dashboard (master banner + per-card badge), the Lab download panel, and the Setup card.
- **New tracker statuses** — `interview_requested` + `action_needed` added to `src/lib/statuses.ts` (single source of truth) and the 8-column board.
- **Mock Interview gating** — the Lab's Mock Interview step is locked until the application reaches an interview stage (`isInterviewStage`).
- **Email triage core** — `src/lib/email-triage.ts` (LLM classifier + deterministic company matcher + confidence gate) and `POST /api/email/triage` (classify → match → auto-apply when confident, else flag for review). Works on a pasted email today; no Gmail needed.
- **Outreach LinkedIn assist** — `buildLinkedInSearch` + "Find recruiter on LinkedIn" button next to the mailto link in the Lab outreach panel (opens a search; you send manually).

---

## Remaining — blocked on user setup / external accounts

These finish the "act on my behalf" features. They need things only the user can provide, so they're parked until then.

### 1. Activate the launchd schedules
- **Needs from user:** run the `cp` + `launchctl load` commands printed by `npm run install-schedule -- poll-gmail` and `npm run install-schedule` (refresh-feed) to actually start the background jobs.

### 2. Review queue UI (feature A, ambiguous half)
- **Build:** a "Needs review" panel on the dashboard reading `email_triage_log` rows where `applied = 0` (low-confidence or unmatched triage results), for one-tap confirm/dismiss.

### 3. Browser-extension email/LinkedIn integration (features A + B)
- **Build:** extend the Phase-7 Chrome extension to (a) read the open Gmail tab as an immediate triage feed, and (b) **pre-fill** a LinkedIn DM / Gmail compose in the open tab for the user to click send.
- **Constraint:** pre-fill + user-clicks-send only. Automated LinkedIn sending violates ToS and risks account bans regardless of mechanism — opt-in/explore only, never default.

### 4. Gmail send for outreach (feature B)
- **Needs from user:** the same OAuth client with Gmail send scope.
- **Build:** "send via Gmail" on the outreach panel with a **per-message confirm** (review recipient + body first). No bulk/auto-send. Also needs a way to capture the recruiter's email (user-provided/paste for v1).
