import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / asset-dependent packages out of the bundler so they resolve
  // their own files at runtime (better-sqlite3 native binding, pdfkit AFM fonts).
  serverExternalPackages: ["better-sqlite3", "pdfkit"],
};

export default nextConfig;
