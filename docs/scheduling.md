# Scheduling the Job Feed refresh

The Job Feed can be refreshed two ways:

1. **Manually** — the **Refresh now** button on the `/feed` page, or `npm run refresh-feed`.
2. **On a schedule** — a macOS `launchd` job that runs `npm run refresh-feed` daily.

The scheduled refresh uses the exact same code path as the button (`scripts/refresh-feed.ts` → `refreshFeed()`), writing to the same `data/app.db`, so it works whether or not the dev server is running.

## Install the daily schedule

Generate the launchd plist (default 8:00am; pass `HOUR MINUTE` to change):

```bash
npm run install-schedule          # 8:00am daily
npm run install-schedule -- 7 30  # 7:30am daily
```

This writes `scripts/com.jobhuntcopilot.refresh.plist` and prints the two commands to install it. The script never touches `~/Library/LaunchAgents` or runs `launchctl` for you — you run these yourself:

```bash
cp scripts/com.jobhuntcopilot.refresh.plist ~/Library/LaunchAgents/com.jobhuntcopilot.refresh.plist
launchctl load ~/Library/LaunchAgents/com.jobhuntcopilot.refresh.plist
```

Output is appended to `data/refresh.log`.

## Stop / uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.jobhuntcopilot.refresh.plist
rm ~/Library/LaunchAgents/com.jobhuntcopilot.refresh.plist
```

## Notes

- The job calls `npm` via the absolute path to your current Node install (captured when you ran `install-schedule`). If you switch Node versions with nvm, re-run `install-schedule` and re-copy the plist.
- Enrichment (fit score, sponsorship, seniority tags) only runs if an LLM key is present in `.env.local`. Without a key, postings are still fetched and stored, just untagged.
- The number of postings stored per refresh is capped by `FEED_REFRESH_LIMIT` (default 50). Set it in `.env.local`.
