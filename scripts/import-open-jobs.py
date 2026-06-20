#!/usr/bin/env python3
"""
Import HR jobs from the open-jobs dataset into the local SQLite DB.

The open-jobs parquet (~21 GB) is streamed in memory-bounded batches — no full
download. A hull filter is applied per batch so only HR/US rows ever touch SQLite.

Usage:
  python3 scripts/import-open-jobs.py [options]

Options:
  --parquet   URL or local path to the parquet file
              (default: $OPEN_JOBS_PARQUET_URL env var, then the official URL)
  --db        Path to SQLite DB  (default: data/app.db)
  --function  Job function to include, comma-separated  (default: hr)
  --country   ISO-2 country code  (default: US)
  --title-terms  Comma-separated title keywords  (default: preset HR terms)
  --batch     Parquet row-group batch size  (default: 20000)
  --dry-run   Print counts only, do not write to DB

Dependencies: pip install pyarrow
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

try:
    import pyarrow.parquet as pq
except ImportError:
    print("ERROR: pyarrow not installed. Run: pip install pyarrow", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_PARQUET_URL = "https://download.jobscream.com/open-jobs.parquet"

DEFAULT_TITLE_TERMS = [
    "hr", "human resources", "people", "people operations", "talent",
    "talent acquisition", "recruiter", "recruiting", "recruitment", "sourcer",
    "hrbp", "hr business partner", "business partner", "learning", "l&d",
    "compensation", "benefits", "total rewards", "employee relations",
    "dei", "diversity", "inclusion", "workforce", "personnel", "generalist",
    "people partner", "hris", "employee experience", "hr manager",
    "hr director", "hr analyst", "hr coordinator", "hr specialist",
]

STAFFING_COMPANY_PATTERNS = re.compile(
    r"(staffing|adecco|manpower|kelly services|robert half|randstad|kforce|"
    r"staffmark|aerotek|allegis|heidrick|korn ferry|spencer stuart|"
    r"insight global|experis|recruiting agency|placement agency)",
    re.IGNORECASE,
)

STAFFING_TITLE_PATTERNS = re.compile(
    r"\b(staffing agency|contract placement|temp agency|executive search)\b",
    re.IGNORECASE,
)

MARKDOWN_STRIP = re.compile(
    r"#{1,6}\s|(\*\*|__)(.*?)\1|\*(.*?)\*|`{1,3}[^`]*`{1,3}|"
    r"!\[.*?\]\(.*?\)|\[([^\]]*)\]\(.*?\)|^\s*[-*+]\s|^\s*\d+\.\s",
    re.MULTILINE,
)

# Columns we actually read from the parquet (skip the heavy embedding columns)
PARQUET_COLS = [
    "id", "ats", "company", "company_name", "title", "url", "function",
    "level", "sub_function", "work_mode", "is_remote", "remote_scope",
    "country_code", "is_staffing", "management",
    "salary_min_k", "salary_max_k", "salary_currency",
    "visa_sponsorship", "alt_titles", "skills", "nice_to_have",
    "company_does", "industry", "company_stage",
    "years_experience_min", "years_experience_max",
    "city", "region", "posted_at",
    "jd_markdown", "role_summary",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def open_parquet_source(path: str):
    """Local path -> path; http(s) URL -> a range-readable file object so Parquet
    fetches only the footer + the row groups/columns it needs (no full download)."""
    if path.startswith(("http://", "https://")):
        try:
            import fsspec
        except ImportError:
            sys.exit("reading a URL needs fsspec: pip install fsspec aiohttp")
        return fsspec.open(path, "rb").open()
    return path


def strip_markdown(text: str) -> str:
    if not text:
        return ""
    text = MARKDOWN_STRIP.sub(r"\2\3\4", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _val(d: dict, key: str, default=None):
    v = d.get(key)
    return default if v is None else v


def passes_filter(row: dict, funcs: set, country: str, title_terms: list) -> bool:
    # Function filter
    if funcs and _val(row, "function", "").lower() not in funcs:
        return False

    # Country / remote-scope filter.
    # Accept: jobs physically in the target country; US-focused remote scopes;
    # or globally-remote roles NOT anchored to a specific foreign country
    # (a "global remote" role posted from Ukraine in Ukrainian isn't US-relevant).
    rc = (_val(row, "country_code") or "").upper()
    scope = (_val(row, "remote_scope") or "").lower()
    unknown_country = rc in ("", "UNKNOWN")
    country_ok = (
        rc == country
        or (country == "US" and scope in ("us-only", "us-canada"))
        or (country == "US" and scope == "global" and (rc == "US" or unknown_country))
    )
    if not country_ok:
        return False

    # Staffing filter
    if _val(row, "is_staffing", False):
        return False
    company_str = (_val(row, "company_name") or _val(row, "company") or "").lower()
    title_str = (_val(row, "title") or "").lower()
    if STAFFING_COMPANY_PATTERNS.search(company_str):
        return False
    if STAFFING_TITLE_PATTERNS.search(title_str):
        return False

    # Title / alt-title keyword filter
    if title_terms:
        fields = [title_str] + [
            (a or "").lower() for a in (_val(row, "alt_titles") or [])
        ]
        if not any(term in field for field in fields for term in title_terms):
            return False

    return True


def map_row(row: dict) -> dict:
    # work_mode → remote_type
    mode = (_val(row, "work_mode") or "unknown").lower()
    remote_type = {
        "fully_remote": "remote",
        "remote_first": "remote",
        "hybrid": "hybrid",
        "onsite": "onsite",
    }.get(mode, "unknown")

    # salary_range string
    sal_min = _val(row, "salary_min_k")
    sal_max = _val(row, "salary_max_k")
    curr = _val(row, "salary_currency") or "USD"
    if sal_min and sal_min > 0 and sal_max and sal_max > 0:
        salary_range = f"${int(sal_min)}K–${int(sal_max)}K {curr}"
    elif sal_min and sal_min > 0:
        salary_range = f"${int(sal_min)}K+ {curr}"
    else:
        salary_range = None

    # jd_text from jd_markdown
    jd_raw = _val(row, "jd_markdown") or ""
    jd_text = strip_markdown(jd_raw) or None

    # sponsorship_tag from visa_sponsorship
    visa = (_val(row, "visa_sponsorship") or "unknown").lower()
    sponsorship_tag = {"yes": "likely", "no": "no"}.get(visa, "unclear")

    # seniority_tag from level
    level = (_val(row, "level") or "").lower()
    if level in ("intern", "entry"):
        seniority_tag = "junior"
    elif level in ("senior", "staff", "lead"):
        seniority_tag = "senior"
    elif level in ("manager", "director", "vp", "c-level"):
        seniority_tag = "staff+"
    else:
        seniority_tag = "mid"

    # location string
    city = _val(row, "city") or ""
    region = _val(row, "region") or ""
    location = f"{city}, {region}".strip(", ") or None

    # posted_at → ISO string (pyarrow may give a Timestamp object)
    posted_at = _val(row, "posted_at")
    if posted_at is not None:
        posted_date = str(posted_at)[:10]  # keep YYYY-MM-DD
    else:
        posted_date = None

    ats = _val(row, "ats") or "unknown"
    company = _val(row, "company_name") or _val(row, "company") or ""
    role_summary = _val(row, "role_summary") or None
    fit_summary = f"Open-jobs summary: {role_summary}" if role_summary else None

    return {
        "source": f"open-jobs:{ats}",
        "company": company,
        "title": _val(row, "title") or "",
        "location": location,
        "remote_type": remote_type,
        "posted_date": posted_date,
        "jd_text": jd_text,
        "url": _val(row, "url") or None,
        "salary_range": salary_range,
        # pre-filled enrichment (no LLM needed)
        "sponsorship_tag": sponsorship_tag,
        "seniority_tag": seniority_tag,
        "min_years": _val(row, "years_experience_min"),
        "fit_summary": fit_summary,
        # open-jobs extended columns
        "open_jobs_id": str(_val(row, "id") or ""),
        "skills_json": json.dumps(_val(row, "skills") or []),
        "company_summary": _val(row, "company_does") or None,
        "industry": _val(row, "industry") or None,
        "job_level": _val(row, "level") or None,
        "job_function": _val(row, "function") or None,
    }


INSERT_SQL = """
INSERT INTO jobs (
    source, company, title, location, remote_type, posted_date,
    jd_text, url, salary_range, sponsorship_tag, seniority_tag,
    min_years, fit_summary, open_jobs_id, skills_json,
    company_summary, industry, job_level, job_function
) VALUES (
    :source, :company, :title, :location, :remote_type, :posted_date,
    :jd_text, :url, :salary_range, :sponsorship_tag, :seniority_tag,
    :min_years, :fit_summary, :open_jobs_id, :skills_json,
    :company_summary, :industry, :job_level, :job_function
)
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", default=None,
                    help="URL or local path to open-jobs.parquet")
    ap.add_argument("--db", default="data/app.db",
                    help="Path to SQLite DB (default: data/app.db)")
    ap.add_argument("--function", dest="functions", default="hr",
                    help="Comma-separated job functions to include (default: hr)")
    ap.add_argument("--country", default="US",
                    help="ISO-2 country code (default: US)")
    ap.add_argument("--title-terms", dest="title_terms", default=None,
                    help="Comma-separated title keyword overrides")
    ap.add_argument("--batch", type=int, default=20_000,
                    help="Parquet batch size (default: 20000)")
    ap.add_argument("--max-batches", type=int, default=0,
                    help="Stop after N batches (0 = scan whole file). For quick tests.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print counts only, do not write")
    args = ap.parse_args()

    # Resolve parquet source
    parquet_src = (
        args.parquet
        or os.environ.get("OPEN_JOBS_PARQUET_URL")
        or DEFAULT_PARQUET_URL
    )

    funcs = {f.strip().lower() for f in args.functions.split(",") if f.strip()}
    country = args.country.strip().upper()
    if args.title_terms:
        title_terms = [t.strip().lower() for t in args.title_terms.split(",") if t.strip()]
    else:
        title_terms = DEFAULT_TITLE_TERMS

    print(f"[open-jobs] parquet : {parquet_src}", file=sys.stderr)
    print(f"[open-jobs] db      : {args.db}", file=sys.stderr)
    print(f"[open-jobs] filter  : function={funcs} country={country} "
          f"title_terms={len(title_terms)} terms", file=sys.stderr)
    if args.dry_run:
        print("[open-jobs] DRY RUN — nothing will be written", file=sys.stderr)

    # Open DB (or skip if dry-run)
    conn = None
    if not args.dry_run:
        db_path = Path(args.db)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row

        # Load existing open_jobs_ids and urls for fast dedup
        existing_ids: set = {
            r[0] for r in conn.execute(
                "SELECT open_jobs_id FROM jobs WHERE open_jobs_id IS NOT NULL"
            )
        }
        existing_urls: set = {
            r[0] for r in conn.execute(
                "SELECT url FROM jobs WHERE url IS NOT NULL"
            )
        }
    else:
        existing_ids = set()
        existing_urls = set()

    # Track all open_jobs_ids seen in this run (for expiry cleanup)
    current_ids: set = set()

    # Stream parquet (local path or http(s) URL via fsspec range reads)
    pf = pq.ParquetFile(open_parquet_source(parquet_src))
    scanned = 0
    passed = 0
    inserted = 0
    # (company_lower, title_lower) dedup within this run
    seen_pairs: set = set()

    batch_no = 0
    for batch in pf.iter_batches(batch_size=args.batch, columns=PARQUET_COLS):
        batch_no += 1
        if args.max_batches and batch_no > args.max_batches:
            print(f"\n[open-jobs] stopping after {args.max_batches} batch(es) (--max-batches)", file=sys.stderr)
            break
        cols = batch.to_pydict()
        n = len(cols["id"])
        scanned += n

        for i in range(n):
            row = {k: cols[k][i] for k in cols}

            if not passes_filter(row, funcs, country, title_terms):
                continue
            passed += 1

            oj_id = str(row.get("id") or "")
            if oj_id:
                current_ids.add(oj_id)

            if args.dry_run:
                continue

            # Dedup by open_jobs_id
            if oj_id and oj_id in existing_ids:
                continue

            mapped = map_row(row)

            # Dedup by URL
            url = mapped.get("url")
            if url and url in existing_urls:
                continue

            # Dedup by (company, title) within this run
            pair_key = (mapped["company"].lower(), mapped["title"].lower())
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            try:
                conn.execute(INSERT_SQL, mapped)  # type: ignore[union-attr]
                inserted += 1
                if oj_id:
                    existing_ids.add(oj_id)
                if url:
                    existing_urls.add(url)
            except sqlite3.IntegrityError:
                pass  # unique index on url caught it

        # Commit per batch so a long streaming run that drops its connection
        # keeps the progress it already made (the scan can be resumed).
        if not args.dry_run and conn:
            conn.commit()

        print(
            f"\r[open-jobs] scanned {scanned:,} | passed filter {passed:,} | inserted {inserted:,}",
            end="",
            file=sys.stderr,
            flush=True,
        )

    print("", file=sys.stderr)  # newline after progress line

    if not args.dry_run and conn:
        conn.commit()

        # Expiry cleanup: remove open-jobs rows no longer in the parquet that
        # haven't been saved to the tracker by the user. Skipped on a partial
        # (--max-batches) scan, which must not expire rows it never examined.
        if current_ids and not args.max_batches:
            placeholders = ",".join("?" * len(current_ids))
            deleted = conn.execute(
                f"""DELETE FROM jobs
                    WHERE source LIKE 'open-jobs:%'
                      AND open_jobs_id IS NOT NULL
                      AND open_jobs_id NOT IN ({placeholders})
                      AND id NOT IN (SELECT job_id FROM applications)""",
                list(current_ids),
            ).rowcount
            conn.commit()
            if deleted:
                print(f"[open-jobs] removed {deleted} expired postings", file=sys.stderr)

        conn.close()

    print(
        f"[open-jobs] done: scanned={scanned:,} passed={passed:,} inserted={inserted:,}",
        file=sys.stderr,
    )
    if args.dry_run:
        print(f"[open-jobs] (dry run — {passed:,} rows would be candidates for import)")


if __name__ == "__main__":
    main()
