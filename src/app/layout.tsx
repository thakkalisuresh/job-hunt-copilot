import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Hunt Copilot",
  description: "Tailor resumes, practice interviews, and track applications.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-semibold">
              Job Hunt Copilot
            </Link>
            <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900">
              Tracker
            </Link>
            <Link href="/feed" className="text-sm text-zinc-600 hover:text-zinc-900">
              Job Feed
            </Link>
            <Link href="/setup" className="text-sm text-zinc-600 hover:text-zinc-900">
              Setup
            </Link>
            {session?.user ? (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
                className="ml-auto"
              >
                <button
                  type="submit"
                  className="text-sm text-zinc-500 hover:text-zinc-900"
                  title={session.user.email ?? undefined}
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
