import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { EMPTY_PROFILE, ProfileData } from "@/lib/profile";

export async function GET() {
  const db = getDb();
  const row = db.prepare("SELECT data_json FROM profile WHERE id = 1").get() as
    | { data_json: string }
    | undefined;

  const profile: ProfileData = row
    ? { ...EMPTY_PROFILE, ...JSON.parse(row.data_json) }
    : EMPTY_PROFILE;

  return NextResponse.json({ profile });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const profile: ProfileData = { ...EMPTY_PROFILE, ...body };

  const db = getDb();
  db.prepare(
    `INSERT INTO profile (id, data_json) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`
  ).run(JSON.stringify(profile));

  return NextResponse.json({ profile });
}
