import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets the e2e servers (playwright.config.ts) build and run beside a developer's own `next dev` /
  // `next start` without touching their `.next` (Next 16 locks it per dist dir).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the root: a stray package-lock.json higher up would otherwise confuse Next.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
