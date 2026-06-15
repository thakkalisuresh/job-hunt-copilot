import { NextResponse } from "next/server";
import { refreshFeed } from "@/lib/jobs/refresh";

export const maxDuration = 300;

export async function POST() {
  try {
    const summary = await refreshFeed();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
