#!/bin/bash
# download-open-jobs.sh — resumable, self-healing download of the open-jobs parquet.
#
# The dataset is a single ~20.5 GB parquet, refreshed in place daily. Streaming it
# over HTTP for a full scan is slow and drops connections (HTTP/2 stream errors), so
# we download it once to a local file and scan that. Resumable (curl -C -) and
# self-healing (re-invokes curl until the file is complete), forced to HTTP/1.1.
#
#   scripts/download-open-jobs.sh [URL] [OUT]
#
# Defaults: URL = $OPEN_JOBS_DOWNLOAD_URL or the canonical URL; OUT = open-jobs.parquet
set -u

URL="${1:-${OPEN_JOBS_DOWNLOAD_URL:-https://download.jobscream.com/open-jobs.parquet}}"
OUT="${2:-open-jobs.parquet}"

# Authoritative size from the server (Content-Length), so we know when we're done.
TARGET=$(curl -sLI "$URL" | awk 'tolower($1)=="content-length:"{print $2}' | tr -d '\r' | tail -1)
if [ -z "${TARGET:-}" ]; then
  echo "[download] could not read Content-Length; downloading without size check" >&2
  TARGET=0
fi
echo "[download] target ${TARGET:-unknown} bytes -> $OUT" >&2

for attempt in $(seq 1 50); do
  sz=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null || echo 0)
  if [ "$TARGET" -gt 0 ] && [ "$sz" -ge "$TARGET" ]; then
    echo "[download] complete: $sz bytes (attempt $attempt)" >&2
    exit 0
  fi
  echo "[download] attempt $attempt: resuming from $sz bytes" >&2
  curl -L --http1.1 -C - --retry 10 --retry-delay 5 --retry-all-errors -fsS -o "$OUT" "$URL" && {
    # curl returned success; verify size
    sz=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT" 2>/dev/null || echo 0)
    if [ "$TARGET" -eq 0 ] || [ "$sz" -ge "$TARGET" ]; then
      echo "[download] complete: $sz bytes" >&2
      exit 0
    fi
  }
  sleep 3
done

echo "[download] FAILED to complete after 50 attempts" >&2
exit 1
