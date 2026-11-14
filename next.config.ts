import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets the e2e servers (playwright.config.ts) build and run beside a developer's own `next dev` /
  // `next start` without touching their `.next` (Next 16 locks it per dist dir).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the root: a stray package-lock.json higher up would otherwise confuse Next.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // A share link's token is the birder's list: the Referer is the origin only, everywhere. The root layout's metadata
  // sets the same policy as a <meta> tag; the header doesn't depend on where streaming metadata puts that tag.
  async headers() {
    // The site icons change only with a redesign: browsers keep them a week instead of revalidating every visit.
    const icons = [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }];
    return [
      { source: "/:path*", headers: [{ key: "Referrer-Policy", value: "strict-origin" }] },
      { source: "/icons/:file*", headers: icons },
      { source: "/favicon.ico", headers: icons },
    ];
  },
};

export default nextConfig;
