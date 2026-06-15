# Deployment

## TL;DR — this is a local-first app

Job Hunt Copilot stores everything in a local SQLite file (`data/app.db`) via
`better-sqlite3`, and it holds your resume, application history, and API keys. The
intended way to run it is **locally on your machine**:

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                         # http://localhost:3000
```

There's no server to pay for, your data never leaves your laptop, and the
scheduled refresh runs via `launchd` (see [scheduling.md](./scheduling.md)).

For most people, **you do not need to deploy this anywhere.**

## Why Vercel isn't a drop-in

Vercel (and most serverless hosts) give each request an **ephemeral, read-only**
filesystem. `better-sqlite3` writes to a local file, so on Vercel:

- writes either fail or vanish between invocations — your tracker/resumes won't persist, and
- `better-sqlite3` is a native module that needs the right build target.

So you can't just `vercel deploy` this as-is and keep your data.

## If you really want it hosted

You'd swap the storage layer for a hosted database and move scheduling to a cron
service. The app is structured to make this contained — all DB access goes through
`src/lib/db.ts`.

1. **Database** — replace SQLite with a hosted libSQL/SQLite (e.g. Turso via
   `@libsql/client`) or Postgres. Turso is the smallest change since the SQL is
   already SQLite-flavored: point `src/lib/db.ts` at a libSQL client and run the
   same schema. Add `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` env vars.
2. **Env vars** — set these in the Vercel project settings:
   - `ANTHROPIC_API_KEY` (and `LLM_PROVIDER` / `GOOGLE_API_KEY` if using Gemini)
   - `APIFY_TOKEN` (optional)
   - `FEED_REFRESH_LIMIT` (optional)
   - your hosted-DB credentials
3. **Build** — `serverExternalPackages` already keeps `better-sqlite3`/`pdfkit`
   external; if you drop `better-sqlite3` for libSQL you can remove it from that
   list in `next.config.ts`.
4. **Scheduled refresh** — replace the `launchd` job with a
   [Vercel Cron](https://vercel.com/docs/cron-jobs) entry hitting
   `POST /api/feed/refresh` on your schedule.
5. **Auth** — the local app assumes a single trusted user. If it's reachable on
   the public internet, put authentication in front of it before exposing your
   resume, application data, and API keys.

## Recommendation

Keep it local unless you specifically need to reach it from multiple devices. If
you do, Turso + Vercel Cron is the lightest hosted path; budget an hour for the
DB-layer swap and a careful look at auth.
