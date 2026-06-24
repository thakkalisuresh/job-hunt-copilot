#!/usr/bin/env python3
"""
Train the preference ranker for fit scoring (Phase 3, Stage 2).

Positives = jobs the user SAVED (have an application). Negatives = jobs explicitly
DISMISSED (jobs.dismissed=1), plus, if too few, a random sample of un-saved jobs as
implicit negatives. Features = the job's jd_embedding (1536-dim float32 BLOB).

Fits an L2-regularized logistic regression in numpy → a ~6 KB weight vector exported
to data/ranker.json, which the app loads and blends with the heuristic on prod.

  .venv-openjobs/bin/python scripts/train-ranker.py --db data/app.db --out data/ranker.json

Honest about data: prints positive/negative counts + holdout accuracy/AUC, and refuses
to claim a usable model when the data is too thin (it still writes one, gated by
`ready: false`, so the serving blend stays heuristic-only until there's enough signal).
"""
import argparse, json, os, sqlite3, sys
import numpy as np

DIMS = 1536
MIN_POSITIVES = 30      # below this, the model is noise; mark ready=false
NEG_RATIO = 3           # sample up to 3x implicit negatives when explicit ones are scarce


def load_emb(blob):
    if blob is None or len(blob) != DIMS * 4:
        return None
    v = np.frombuffer(blob, dtype="<f4").astype(np.float64)
    n = np.linalg.norm(v)
    return v / n if n else None


def fetch(conn, sql, params=()):
    return conn.execute(sql, params).fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/app.db")
    ap.add_argument("--out", default="data/ranker.json")
    ap.add_argument("--lam", type=float, default=1.0, help="L2 strength")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    conn = sqlite3.connect(args.db)

    # Positives: saved jobs with an embedding.
    pos = [load_emb(r[0]) for r in fetch(conn,
        "SELECT j.jd_embedding FROM jobs j JOIN applications a ON a.job_id=j.id WHERE j.jd_embedding IS NOT NULL")]
    pos = [v for v in pos if v is not None]

    # Explicit negatives: dismissed jobs (column may not exist yet).
    try:
        neg = [load_emb(r[0]) for r in fetch(conn,
            "SELECT jd_embedding FROM jobs WHERE dismissed=1 AND jd_embedding IS NOT NULL")]
        neg = [v for v in neg if v is not None]
    except sqlite3.OperationalError:
        neg = []

    # Top up with implicit negatives (random un-saved, un-dismissed jobs).
    need = max(0, NEG_RATIO * len(pos) - len(neg))
    if need:
        rows = fetch(conn,
            "SELECT jd_embedding FROM jobs WHERE jd_embedding IS NOT NULL "
            "AND id NOT IN (SELECT job_id FROM applications) ORDER BY RANDOM() LIMIT ?", (need,))
        neg += [v for v in (load_emb(r[0]) for r in rows) if v is not None]

    print(f"[train] positives={len(pos)} negatives={len(neg)}", file=sys.stderr)
    if len(pos) < 2 or len(neg) < 2:
        sys.exit("[train] not enough labeled data to train (need ≥2 of each).")

    X = np.vstack(pos + neg)
    y = np.concatenate([np.ones(len(pos)), np.zeros(len(neg))])

    # Shuffle + 75/25 holdout.
    idx = rng.permutation(len(y)); X, y = X[idx], y[idx]
    cut = max(1, int(0.75 * len(y)))
    Xtr, ytr, Xte, yte = X[:cut], y[:cut], X[cut:], y[cut:]

    # L2-regularized logistic regression via gradient descent.
    w = np.zeros(X.shape[1]); b = 0.0; lr = 0.5
    for _ in range(2000):
        z = Xtr @ w + b
        p = 1 / (1 + np.exp(-z))
        g = p - ytr
        w -= lr * (Xtr.T @ g / len(ytr) + args.lam * w / len(ytr))
        b -= lr * g.mean()

    def acc_auc(Xs, ys):
        if len(ys) == 0:
            return None, None
        p = 1 / (1 + np.exp(-(Xs @ w + b)))
        acc = float(((p > 0.5) == ys).mean())
        # simple AUC
        pos_s, neg_s = p[ys == 1], p[ys == 0]
        if len(pos_s) and len(neg_s):
            auc = float((pos_s[:, None] > neg_s[None, :]).mean())
        else:
            auc = None
        return acc, auc

    tr_acc, tr_auc = acc_auc(Xtr, ytr)
    te_acc, te_auc = acc_auc(Xte, yte)
    ready = len(pos) >= MIN_POSITIVES
    print(f"[train] train acc={tr_acc:.2f} auc={tr_auc} | holdout acc={te_acc} auc={te_auc}", file=sys.stderr)
    if not ready:
        print(f"[train] ⚠ only {len(pos)} positives (<{MIN_POSITIVES}) — model marked ready=false; "
              "serving stays heuristic-only until you've saved/skipped more jobs.", file=sys.stderr)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    json.dump({
        "dims": DIMS, "bias": b, "weights": w.tolist(),
        "ready": ready, "positives": len(pos), "negatives": len(neg),
        "holdout_acc": te_acc, "holdout_auc": te_auc,
        "trained_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }, open(args.out, "w"))
    print(f"[train] wrote {args.out} (ready={ready})", file=sys.stderr)


if __name__ == "__main__":
    main()
