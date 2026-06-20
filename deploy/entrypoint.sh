#!/bin/sh
# Container entrypoint: run the scheduled jobs (supercronic) in the background and
# the Next.js server in the foreground. Both share /app/data (the SQLite volume);
# better-sqlite3 + WAL serializes their writes, same as the local Mac setup.
set -e

# Background scheduler. Logs go to container stdout.
supercronic /app/deploy/crontab &

# Foreground web server (receives signals as the main process).
exec npm run serve
