import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");

declare global {
  var __db: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__db) {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    runMigrations(db);
    global.__db = db;
  }
  return global.__db;
}

function runMigrations(db: Database.Database) {
  const appColumns = db
    .prepare("PRAGMA table_info(applications)")
    .all() as { name: string }[];
  if (!appColumns.some((c) => c.name === "conversation_json")) {
    db.exec("ALTER TABLE applications ADD COLUMN conversation_json TEXT");
  }

  const jobColumns = db
    .prepare("PRAGMA table_info(jobs)")
    .all() as { name: string }[];
  const has = (name: string) => jobColumns.some((c) => c.name === name);
  if (!has("min_years")) db.exec("ALTER TABLE jobs ADD COLUMN min_years INTEGER");
  if (!has("fit_summary")) db.exec("ALTER TABLE jobs ADD COLUMN fit_summary TEXT");
  if (!has("enriched_at")) db.exec("ALTER TABLE jobs ADD COLUMN enriched_at TEXT");

  // Dedupe feed jobs by URL (manual jobs may have NULL urls; SQLite allows many NULLs).
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url) WHERE url IS NOT NULL"
  );

  const triageColumns = db
    .prepare("PRAGMA table_info(email_triage_log)")
    .all() as { name: string }[];
  if (!triageColumns.some((c) => c.name === "dismissed")) {
    db.exec("ALTER TABLE email_triage_log ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0");
  }

  if (!appColumns.some((c) => c.name === "recruiter_email")) {
    db.exec("ALTER TABLE applications ADD COLUMN recruiter_email TEXT");
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  is_master INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL,
  raw_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  remote_type TEXT,
  posted_date TEXT,
  jd_text TEXT,
  url TEXT,
  sponsorship_tag TEXT,
  seniority_tag TEXT,
  salary_range TEXT,
  fit_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL DEFAULT 'saved',
  resume_version_id INTEGER REFERENCES resumes(id),
  outreach_draft TEXT,
  recruiter_email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  step TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsor_lookup (
  employer_name TEXT PRIMARY KEY,
  sponsorship_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_triage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT UNIQUE NOT NULL,
  received_at TEXT,
  from_address TEXT,
  subject TEXT,
  category TEXT NOT NULL,
  confidence TEXT NOT NULL,
  reason TEXT,
  application_id INTEGER REFERENCES applications(id),
  match_score INTEGER,
  suggested_status TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
