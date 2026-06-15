# Job Hunt Copilot

A local-first web app that takes you from **find a fresh, relevant job** →
**tailor your resume for it** → **practice the interview** → **draft outreach** →
**track the application** — without copy-pasting between AI chat tabs.

It combines two workflows: a 4-prompt resume-tailoring pipeline (ATS Diagnoser →
Recruiter keyword gap → XYZ Rewriter → Mock Interview) and an automated
job-discovery + outreach feed.

Everything runs on your machine and stores data in a local SQLite file. Your
resume, application history, and API keys never leave your laptop.

## Quick start

```bash
npm install
cp .env.local.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                           # http://localhost:3000
```

Then:

1. **Setup** — upload your master resume and fill in your application profile.
2. **Job Feed** — click **Refresh now** to pull fresh postings; filter and save ones you like.
3. **Resume Lab** — run the 4-step pipeline; export the tailored resume; draft outreach.
4. **Tracker** — watch applications move Saved → Tailoring → Applied → … → Offer.

## How it works

The end-to-end flow, and what's automatic vs. manual:

0. **Setup (one-time)** — upload your **master resume** (parsed into structured JSON and stored; never overwritten by tailoring) and fill the **Application Profile** (the reusable answers forms always ask for). Everything builds on this.
1. **Job Feed** — pulls postings from free public APIs (Greenhouse, Lever, RemoteOK, HN "Who's hiring") plus optional Apify actors for career pages that need scraping. Each card gets a Claude **fit score vs. your master resume** and filters (freshness, seniority, sponsorship). You can also add a job manually on the Tracker.
2. **Save → Tracker card** — saving a feed job creates an application in **Saved**. No resume is created yet.
3. **Resume Lab (per application)** — a 4-step Claude pipeline in one shared conversation: **Diagnoser** (ATS issues) → **Recruiter** (missing keywords) → **Rewriter** (*this step creates the tailored resume version* for that job) → **Mock Interview** (practice Q&A, gated until the role reaches an interview stage). Plus an **Outreach** email draft.
4. **Download & apply (manual)** — export the tailored resume as **PDF** (apply-ready) / **DOCX** (editable) and submit it yourself. The app never auto-applies. The optional Chrome extension can autofill form fields from your Profile.
5. **Tracker** — Kanban from Saved → Tailoring → Applied → Interviewing → Offer / Rejected; tailoring and outreach auto-advance a card.

So the chain is: **Setup → Job Feed (fit-scored) → Save → Resume Lab (rewrite = tailored resume) → download PDF → apply manually → track.**

Resumes are stored in one `resumes` table: the **master** (`is_master = 1`) and one **tailored copy per application** (created by the Rewriter, linked via `applications.resume_version_id`). Before you tailor, an application falls back to the master.

> **Needs keys to run for real:** the LLM steps (fit score, pipeline, classification) need `ANTHROPIC_API_KEY`; the scraped feed sources need an Apify token (the direct public APIs work without one).

## Features

| Area | What it does |
|---|---|
| **Setup** | Resume upload (PDF/DOCX/text) parsed into structured JSON; reusable application profile ("cheat sheet" for forms) |
| **Job Feed** | Pulls from Greenhouse, Lever, RemoteOK, and HN "Who's hiring" (public APIs) + optional Apify actors. Filters by freshness, location, seniority, years required, visa sponsorship, fit score |
| **Resume Lab** | 4-step pipeline in one shared conversation; tailored resume versions linked to each job; before/after bullet diffs; scored mock-interview answers |
| **Export** | Every tailored resume is available two ways, always: a **PDF** that's apply-ready (submit as-is) and an **editable DOCX** |
| **Outreach** | Short personalized email draft + `mailto:` link. Draft only — nothing is sent automatically |
| **Tracker** | Kanban board; auto-advances cards as you tailor / draft |
| **Scheduling** | `launchd` job to refresh the feed daily ([docs/scheduling.md](docs/scheduling.md)) |
| **Chrome extension** | Optional autofill for application forms from your profile — fills + highlights, you submit ([extension/README.md](extension/README.md)) |

## LLM provider

Defaults to Claude (`claude-sonnet-4-6`). Set `LLM_PROVIDER=gemini` + `GOOGLE_API_KEY`
in `.env.local` to switch to Gemini. Both go through one interface in
`src/lib/llm.ts`.

## Visa sponsorship data (optional)

The feed tags employers as "Known sponsor" using DOL H-1B/LCA disclosure data.
To build the lookup table, download the latest LCA file, export it as CSV, and run:

```bash
npm run aggregate-lca -- /path/to/LCA_Disclosure.csv
```

See the header of `scripts/aggregate-lca.ts` for where to get the file.

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run refresh-feed` — pull the job feed from the command line
- `npm run install-schedule` — generate a launchd plist for daily refresh
- `npm run aggregate-lca` — build the sponsor lookup table from DOL data

## What it won't do

No auto-submitting applications, no bot-style mass-applying, no scraping from your
own browser/IP, no sending email on your behalf. The app makes you fast; you stay
in control of every submission. See [docs/deploy.md](docs/deploy.md) for hosting notes
(it's intentionally local-first).

## Boring details

- Next.js 16 (App Router, TypeScript, Tailwind), React 19
- `better-sqlite3` at `data/app.db` (gitignored)
- Resume parsing: `pdf-parse` / `mammoth`; rendering: `pdfkit` / `docx`
