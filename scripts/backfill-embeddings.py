#!/usr/bin/env python3
"""
Backfill jobs.jd_embedding (BLOB) from the open-jobs parquet, matched by
open_jobs_id. The embedding is stored as raw little-endian float32 bytes
(1536 dims) so Node can read it as a Float32Array for the learned ranker.

  .venv-openjobs/bin/python scripts/backfill-embeddings.py \
      --parquet ~/Downloads/open-jobs.parquet --db data/app.db

Only touches rows that already exist in the DB (source open-jobs:%); the parquet
scan reads just the id + jd_embedding columns.
"""
import argparse, os, sqlite3, sys

try:
    import numpy as np
    import pyarrow.parquet as pq
except ImportError:
    sys.exit("needs pyarrow + numpy: .venv-openjobs/bin/pip install pyarrow numpy")

DIMS = 1536


def open_src(path):
    if path.startswith(("http://", "https://")):
        import fsspec
        return fsspec.open(path, "rb").open()
    return os.path.expanduser(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parquet", default=os.environ.get("OPEN_JOBS_PARQUET_URL", "open-jobs.parquet"))
    ap.add_argument("--db", default="data/app.db")
    ap.add_argument("--batch", type=int, default=20000)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    want = {str(r[0]): r[1] for r in conn.execute(
        "SELECT open_jobs_id, id FROM jobs WHERE open_jobs_id IS NOT NULL")}
    print(f"[backfill] {len(want)} open-jobs rows to fill", file=sys.stderr)
    if not want:
        return

    pf = pq.ParquetFile(open_src(args.parquet))
    upd = "UPDATE jobs SET jd_embedding = ? WHERE id = ?"
    filled = scanned = 0
    for batch in pf.iter_batches(batch_size=args.batch, columns=["id", "jd_embedding"]):
        cols = batch.to_pydict()
        ids, embs = cols["id"], cols["jd_embedding"]
        for i in range(len(ids)):
            scanned += 1
            row_id = want.get(str(ids[i]))
            if row_id is None:
                continue
            emb = embs[i]
            if emb is None or len(emb) != DIMS:
                continue
            blob = np.asarray(emb, dtype="<f4").tobytes()  # little-endian float32
            conn.execute(upd, (blob, row_id))
            filled += 1
        conn.commit()
        print(f"\r[backfill] scanned {scanned:,} | filled {filled:,}", end="", file=sys.stderr, flush=True)
    print("", file=sys.stderr)
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM jobs WHERE jd_embedding IS NOT NULL").fetchone()[0]
    print(f"[backfill] done: {filled} filled this run | {n} rows now have embeddings", file=sys.stderr)
    conn.close()


if __name__ == "__main__":
    main()
