import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hasGmailCredentials, sendEmail } from "@/lib/gmail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send the outreach email via the connected Gmail account. The client must
 * pass the exact recipient/subject/body to send (after the user has reviewed
 * and optionally edited the generated draft) — this is the single
 * per-message confirm point; nothing is sent automatically.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const app = db.prepare("SELECT id FROM applications WHERE id = ?").get(id);
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!hasGmailCredentials()) {
    return NextResponse.json(
      {
        error:
          "Gmail is not connected. Run `npm run connect-gmail` and add the resulting refresh token to .env.local.",
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email address" }, { status: 400 });
  }
  if (!subject || !text.trim()) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  try {
    const result = await sendEmail({ to, subject, body: text });
    db.prepare(
      `UPDATE applications
       SET recruiter_email = ?, outreach_draft = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(to, JSON.stringify({ subject, body: text }), id);
    return NextResponse.json({ ok: true, messageId: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    const insufficientScope = message.toLowerCase().includes("insufficient");
    return NextResponse.json(
      {
        error: insufficientScope
          ? "Gmail is connected with read-only access. Re-run `npm run connect-gmail` to grant send permission, then update GOOGLE_REFRESH_TOKEN in .env.local."
          : message,
      },
      { status: 502 }
    );
  }
}
