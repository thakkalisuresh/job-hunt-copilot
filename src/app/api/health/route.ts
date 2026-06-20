// Unauthenticated liveness probe for the host (Fly health checks, uptime
// monitors). Excluded from the proxy guard so it returns 200 without a session.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
