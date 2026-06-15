/**
 * Gmail poller (BACKLOG feature A — Gmail connector, background half).
 *
 * Pulls recent messages from the connected Gmail account, runs each new one
 * through the existing email-triage logic (src/lib/email-triage.ts), and:
 *  - auto-applies the tracker status update when triage is confident,
 *  - otherwise logs it to `email_triage_log` for manual review.
 *
 * Every processed message is recorded in `email_triage_log` (keyed by Gmail
 * message id) so re-runs never reprocess the same email. Run manually via
 * `npm run poll-gmail`, or on a schedule (see scripts/install-schedule.ts).
 */
import { getDb } from "../src/lib/db";
import { hasLlmKey } from "../src/lib/llm";
import { hasGmailCredentials, listMessageIds, getMessage } from "../src/lib/gmail";
import {
  classifyEmail,
  matchApplication,
  categoryToStatus,
  isConfident,
  MatchableApplication,
} from "../src/lib/email-triage";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — checks below will report what's missing
}

// How far back to search. Already-processed messages are skipped via
// email_triage_log, so a wide window is safe and just costs a few extra reads.
const SEARCH_QUERY = "newer_than:7d";
const MAX_MESSAGES = 25;

async function main() {
  const started = new Date().toISOString();
  console.log(`[${started}] poll-gmail starting…`);

  if (!hasGmailCredentials()) {
    console.log(
      "Gmail is not connected (missing GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN in .env.local). " +
        "Run `npm run connect-gmail` first. Skipping."
    );
    return;
  }
  if (!hasLlmKey()) {
    console.log("No LLM key configured (ANTHROPIC_API_KEY) — cannot classify emails. Skipping.");
    return;
  }

  const db = getDb();
  const apps = db
    .prepare(
      `SELECT a.id, j.company, j.title
       FROM applications a JOIN jobs j ON j.id = a.job_id`
    )
    .all() as MatchableApplication[];

  const alreadySeen = db.prepare(
    "SELECT 1 FROM email_triage_log WHERE gmail_message_id = ?"
  );
  const insertLog = db.prepare(
    `INSERT INTO email_triage_log
       (gmail_message_id, received_at, from_address, subject, category, confidence,
        reason, application_id, match_score, suggested_status, applied)
     VALUES (@gmailMessageId, @receivedAt, @fromAddress, @subject, @category, @confidence,
             @reason, @applicationId, @matchScore, @suggestedStatus, @applied)`
  );
  const updateStatus = db.prepare(
    "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
  );

  const ids = await listMessageIds(SEARCH_QUERY, MAX_MESSAGES);
  console.log(`Found ${ids.length} message(s) matching "${SEARCH_QUERY}".`);

  let processed = 0;
  let autoApplied = 0;
  let flagged = 0;
  const errors: string[] = [];

  for (const id of ids) {
    if (alreadySeen.get(id)) continue;

    try {
      const message = await getMessage(id);
      const email = { from: message.from, subject: message.subject, body: message.body };

      const classification = await classifyEmail(email);
      const match = matchApplication(email, apps);
      const suggestedStatus = categoryToStatus(classification.category);
      const confident = isConfident(classification, match, suggestedStatus);

      let applied = false;
      if (confident && match && suggestedStatus) {
        updateStatus.run(suggestedStatus, match.applicationId);
        applied = true;
        autoApplied++;
      } else if (suggestedStatus) {
        flagged++;
      }

      insertLog.run({
        gmailMessageId: id,
        receivedAt: message.date || null,
        fromAddress: message.from,
        subject: message.subject,
        category: classification.category,
        confidence: classification.confidence,
        reason: classification.reason,
        applicationId: match?.applicationId ?? null,
        matchScore: match?.score ?? null,
        suggestedStatus,
        applied: applied ? 1 : 0,
      });

      processed++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[${new Date().toISOString()}] done: processed ${processed}, auto-applied ${autoApplied}, flagged for review ${flagged}`
  );
  if (errors.length) {
    console.log(`  ${errors.length} error(s):`);
    for (const e of errors) console.log(`   - ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
