#!/usr/bin/env python3
"""
merge-open-jobs.py — copy the open-jobs rows from one SQLite DB into another.

Used to push freshly-imported open-jobs postings into a pulled copy of the prod DB
WITHOUT clobbering prod-only data (applications, email_triage_log, etc.). The prod
container has no sqlite3 CLI, so the merge is done locally on a pulled copy, then the
file is shipped back.

  python3 scripts/merge-open-jobs.py --from data/app.db --into /tmp/prod-app.db

It (1) ensures the target has the open-jobs schema columns + index, (2) inserts every
`source LIKE 'open-jobs:%'` row from --from that isn't already in --into (dedup by
open_jobs_id then url), and (3) optionally prunes target open-jobs rows no longer in
--from that aren't referenced by an application.
"""
import argparse
import sqlite3
import sys

OJ_COLUMNS = [
    ("open_jobs_id", "TEXT"), ("skills_json", "TEXT"), ("company_summary", "TEXT"),
    ("industry", "TEXT"), ("job_level", "TEXT"), ("job_function", "TEXT"),
    ("embed_score", "REAL"),
]

# All jobs columns we copy (intersection of what both DBs have after migration).
COPY_COLS = [
    "source", "company", "title", "location", "remote_type", "posted_date",
    "jd_text", "url", "sponsorship_tag", "seniority_tag", "salary_range",
    "fit_score", "min_years", "fit_summary", "enriched_at",
    "open_jobs_id", "skills_json", "company_summary", "industry",
    "job_level", "job_function", "embed_score",
]


def ensure_schema(conn: sqlite3.Connection):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(jobs)")}
    for name, typ in OJ_COLUMNS:
        if name not in cols:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {name} {typ}")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_jobs_open_jobs_id ON jobs(open_jobs_id) "
        "WHERE open_jobs_id IS NOT NULL"
    )
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", required=True, help="source DB (has open-jobs rows)")
    ap.add_argument("--into", dest="dst", required=True, help="target DB (e.g. pulled prod DB)")
    ap.add_argument("--prune", action="store_true",
                    help="remove target open-jobs rows not in source and not saved to tracker")
    args = ap.parse_args()

    src = sqlite3.connect(args.src)
    dst = sqlite3.connect(args.dst)
    ensure_schema(dst)

    existing_ids = {r[0] for r in dst.execute(
        "SELECT open_jobs_id FROM jobs WHERE open_jobs_id IS NOT NULL")}
    existing_urls = {r[0] for r in dst.execute(
        "SELECT url FROM jobs WHERE url IS NOT NULL")}

    rows = src.execute(
        f"SELECT {', '.join(COPY_COLS)} FROM jobs WHERE source LIKE 'open-jobs:%'"
    ).fetchall()

    placeholders = ", ".join("?" * len(COPY_COLS))
    insert = f"INSERT INTO jobs ({', '.join(COPY_COLS)}) VALUES ({placeholders})"

    oj_idx = COPY_COLS.index("open_jobs_id")
    url_idx = COPY_COLS.index("url")
    inserted = 0
    src_ids = set()
    for row in rows:
        oj = row[oj_idx]
        url = row[url_idx]
        if oj:
            src_ids.add(oj)
        if oj and oj in existing_ids:
            continue
        if url and url in existing_urls:
            continue
        try:
            dst.execute(insert, row)
            inserted += 1
            if oj:
                existing_ids.add(oj)
            if url:
                existing_urls.add(url)
        except sqlite3.IntegrityError:
            pass
    dst.commit()

    pruned = 0
    if args.prune and src_ids:
        ph = ",".join("?" * len(src_ids))
        pruned = dst.execute(
            f"""DELETE FROM jobs
                WHERE source LIKE 'open-jobs:%'
                  AND open_jobs_id IS NOT NULL
                  AND open_jobs_id NOT IN ({ph})
                  AND id NOT IN (SELECT job_id FROM applications)""",
            list(src_ids),
        ).rowcount
        dst.commit()

    total = dst.execute("SELECT COUNT(*) FROM jobs WHERE source LIKE 'open-jobs:%'").fetchone()[0]
    print(f"[merge] inserted {inserted} | pruned {pruned} | target now has {total} open-jobs rows",
          file=sys.stderr)
    src.close()
    dst.close()


if __name__ == "__main__":
    main()
