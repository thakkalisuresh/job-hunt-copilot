/**
 * Build the `sponsor_lookup` table from a DOL H-1B/LCA disclosure CSV.
 *
 * The Department of Labor publishes quarterly LCA disclosure data (employers who
 * filed Labor Condition Applications, a prerequisite for H-1B sponsorship) here:
 *   https://www.dol.gov/agencies/eta/foreign-labor/performance
 * Download the latest "LCA Programs (H-1B, H-1B1, E-3)" file (an .xlsx), open it
 * and export/save as CSV, then run:
 *
 *   npm run aggregate-lca -- /path/to/LCA_Disclosure.csv
 *
 * Optional 2nd/3rd args override the employer and case-status column names:
 *   npm run aggregate-lca -- file.csv EMPLOYER_NAME CASE_STATUS
 *
 * This counts certified applications per employer, normalizes the names, and
 * replaces the sponsor_lookup table. The Job Feed then tags matching employers
 * as "Known sponsor".
 */
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import Database from "better-sqlite3";

function normalizeEmployer(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(INC|LLC|LTD|CORP|CORPORATION|CO|COMPANY|LP|LLP|PLC|GMBH)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const file = process.argv[2];
  const employerCol = process.argv[3] || "EMPLOYER_NAME";
  const statusCol = process.argv[4] || "CASE_STATUS";

  if (!file) {
    console.error("Usage: npm run aggregate-lca -- <csv-file> [employerCol] [statusCol]");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const counts = new Map<string, number>();
  let rows = 0;

  const parser = fs.createReadStream(file).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true })
  );

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    rows++;
    const employer = record[employerCol];
    const status = (record[statusCol] || "").toUpperCase();
    if (!employer) continue;
    if (status && !status.startsWith("CERTIFIED")) continue;
    const key = normalizeEmployer(employer);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.exec(
    `CREATE TABLE IF NOT EXISTS sponsor_lookup (
       employer_name TEXT PRIMARY KEY,
       sponsorship_count INTEGER NOT NULL
     )`
  );

  const insert = db.prepare(
    "INSERT OR REPLACE INTO sponsor_lookup (employer_name, sponsorship_count) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM sponsor_lookup").run();
    for (const [name, count] of counts) insert.run(name, count);
  });
  tx();

  console.log(
    `Processed ${rows.toLocaleString()} rows -> ${counts.size.toLocaleString()} unique employers written to sponsor_lookup.`
  );
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
