#!/usr/bin/env python3
"""
embed-rerank.py — OPTIONAL semantic re-rank of imported open-jobs rows, near-free.

Every open-jobs row in the parquet carries a pre-computed OpenAI `text-embedding-3-small`
(1536-dim) vector for its job description. This script embeds the candidate's master resume
ONCE with the same model (~$0.0001) and stores the cosine similarity vs each job's JD vector
in `jobs.embed_score`. That gives a semantic match signal with no per-job model cost.

Embeddings ONLY compare if the query is embedded with text-embedding-3-small at 1536 dims —
a different model produces garbage rankings (per the open-jobs AGENTS.md).

  # resume text from the DB master resume (default), parquet from OPEN_JOBS_PARQUET_URL:
  OPENAI_API_KEY=sk-... .venv-openjobs/bin/python scripts/embed-rerank.py

  # or an explicit resume file + local parquet (much faster than streaming embeddings over HTTP):
  OPENAI_API_KEY=sk-... .venv-openjobs/bin/python scripts/embed-rerank.py \
      --resume /tmp/resume.txt --parquet ./open-jobs.parquet

Without OPENAI_API_KEY the script exits cleanly (embed_score stays NULL; the heuristic
fit_score is unaffected). Dependencies: pip install pyarrow fsspec aiohttp numpy openai

NOTE: this fetches the heavy `jd_embedding` column from the parquet (most of the 21 GB over
HTTP). Strongly prefer a local parquet file (`python3 scripts/download.py` once) for this step.
"""
import argparse
import json
import os
import sqlite3
import sys

try:
    import numpy as np
    import pyarrow.parquet as pq
except ImportError:
    sys.exit("needs pyarrow + numpy: .venv-openjobs/bin/pip install pyarrow numpy fsspec aiohttp")

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIMS = 1536


def open_parquet_source(path: str):
    if path.startswith(("http://", "https://")):
        try:
            import fsspec
        except ImportError:
            sys.exit("reading a URL needs fsspec: pip install fsspec aiohttp")
        return fsspec.open(path, "rb").open()
    return path


def resume_text_from_db(db_path: str) -> str:
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT content_json, raw_text FROM resumes WHERE is_master = 1 ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    if not row:
        return ""
    content_json, raw_text = row
    # Prefer a compact textual rendering of the structured resume; fall back to raw_text.
    try:
        data = json.loads(content_json)
        parts = [data.get("summary", "")]
        for exp in data.get("experience", []):
            parts.append(f"{exp.get('title','')} at {exp.get('company','')}")
            parts.extend(exp.get("bullets", []) or [])
        parts.extend(data.get("skills", []) or [])
        text = "\n".join(p for p in parts if p)
        if text.strip():
            return text
    except Exception:
        pass
    return raw_text or ""


def embed_resume(text: str) -> "np.ndarray":
    try:
        from openai import OpenAI
    except ImportError:
        sys.exit("needs openai: .venv-openjobs/bin/pip install openai")
    client = OpenAI()
    resp = client.embeddings.create(model=EMBED_MODEL, input=text[:8000], dimensions=EMBED_DIMS)
    vec = np.asarray(resp.data[0].embedding, dtype=np.float32)
    return vec / (np.linalg.norm(vec) + 1e-9)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", default=None, help="URL or local path (default: $OPEN_JOBS_PARQUET_URL)")
    ap.add_argument("--db", default="data/app.db")
    ap.add_argument("--resume", default=None, help="resume text file (default: DB master resume)")
    ap.add_argument("--batch", type=int, default=20_000)
    args = ap.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        print("[embed-rerank] OPENAI_API_KEY not set — skipping (embed_score stays NULL). "
              "Set the key and re-run to enable semantic re-ranking.", file=sys.stderr)
        return

    parquet_src = args.parquet or os.environ.get("OPEN_JOBS_PARQUET_URL") or \
        "https://download.jobscream.com/open-jobs.parquet"

    # Resume text + embedding (one API call)
    resume_text = ""
    if args.resume:
        with open(args.resume, encoding="utf-8") as f:
            resume_text = f.read()
    else:
        resume_text = resume_text_from_db(args.db)
    if not resume_text.strip():
        sys.exit("[embed-rerank] no resume text found (DB master resume empty and no --resume given)")
    print(f"[embed-rerank] embedding resume ({len(resume_text)} chars) with {EMBED_MODEL}…", file=sys.stderr)
    rvec = embed_resume(resume_text)

    # Which open-jobs rows do we have, keyed by open_jobs_id?
    conn = sqlite3.connect(args.db)
    want = {
        str(r[0]): r[1]
        for r in conn.execute(
            "SELECT open_jobs_id, id FROM jobs WHERE source LIKE 'open-jobs:%' AND open_jobs_id IS NOT NULL"
        )
    }
    print(f"[embed-rerank] {len(want)} open-jobs rows to score", file=sys.stderr)
    if not want:
        return

    update = "UPDATE jobs SET embed_score = ? WHERE id = ?"
    pf = pq.ParquetFile(open_parquet_source(parquet_src))
    scored = 0
    for batch in pf.iter_batches(batch_size=args.batch, columns=["id", "jd_embedding"]):
        cols = batch.to_pydict()
        ids = cols["id"]
        embs = cols["jd_embedding"]
        for i in range(len(ids)):
            oj = str(ids[i])
            row_id = want.get(oj)
            if row_id is None:
                continue
            emb = embs[i]
            if emb is None or len(emb) != EMBED_DIMS:
                continue
            jv = np.asarray(emb, dtype=np.float32)
            jv = jv / (np.linalg.norm(jv) + 1e-9)
            cos = float(np.dot(rvec, jv))  # both unit-normalized
            conn.execute(update, (round(cos * 100, 1), row_id))
            scored += 1
        print(f"\r[embed-rerank] scored {scored}/{len(want)}", end="", file=sys.stderr, flush=True)
    print("", file=sys.stderr)
    conn.commit()
    conn.close()
    print(f"[embed-rerank] done: embed_score set on {scored} rows", file=sys.stderr)


if __name__ == "__main__":
    main()
