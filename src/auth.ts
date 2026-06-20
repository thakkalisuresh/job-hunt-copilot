import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) config — single-user Google sign-in.
 *
 * This is a private personal tool, so access is locked to one Google account
 * via ALLOWED_EMAIL. Sessions are JWT (signed cookie) — no database adapter,
 * so the SQLite schema is untouched.
 *
 * Env (see .env.local.example):
 *   AUTH_SECRET        - random secret for signing the session cookie
 *   AUTH_GOOGLE_ID     - Google OAuth web client id
 *   AUTH_GOOGLE_SECRET - Google OAuth web client secret
 *   ALLOWED_EMAILS     - comma-separated Google emails allowed to sign in
 */
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // Required when self-hosting behind a proxy/container (Fly, droplet, LAN):
  // without it NextAuth v5 rejects requests whose Host isn't a known Vercel URL.
  trustHost: true,
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    // Gate sign-in to the allowed account(s). If none configured, fail closed
    // (deny everyone) rather than letting any Google user in.
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      return Boolean(email && allowedEmails.has(email));
    },
    // Used by the proxy (middleware) guard: only signed-in requests pass.
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
});
