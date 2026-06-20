// Route guard (Next 16 renamed `middleware` -> `proxy`). Auth.js's `auth`
// wrapper runs the `authorized` callback from src/auth.ts; unauthenticated
// requests are redirected to the /signin page.
export { auth as proxy } from "@/auth";

export const config = {
  // Protect everything EXCEPT:
  //  - /api/auth/*   (the sign-in / callback endpoints themselves)
  //  - /api/cron/*   (server-to-server jobs, guarded by a bearer secret)
  //  - /api/health   (unauthenticated liveness probe for the host)
  //  - /signin       (the sign-in page)
  //  - Next.js static assets and the favicon
  matcher: [
    "/((?!api/auth|api/cron|api/health|signin|_next/static|_next/image|favicon.ico).*)",
  ],
};
