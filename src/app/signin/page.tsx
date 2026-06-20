import { signIn } from "@/auth";

/**
 * Sign-in page. The proxy guard redirects unauthenticated visitors here.
 * One button → Google OAuth; only ALLOWED_EMAIL is let through (see src/auth.ts).
 */
export default function SignInPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Job Hunt Copilot</h1>
      <p className="text-sm text-zinc-600">
        This is a private workspace. Sign in with the authorized Google account
        to continue.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
