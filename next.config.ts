import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { langRewrites } from "./src/i18n/routes";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets the e2e servers (playwright.config.ts) build and run beside a developer's own `next dev` /
  // `next start` without touching their `.next` (Next 16 locks it per dist dir).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the root: a stray package-lock.json higher up would otherwise confuse Next.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  // No next/image in the app (the flags and share previews are plain <img>, the share image a blob URL), so no image
  // optimisation runs on either host. Unoptimised also keeps Cloudflare's OpenNext build free of an Images binding.
  images: { unoptimized: true },
  // The root layout sits under app/[lang], so a URL no route matches gets app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // Every page is prerendered once per language under app/[lang]; the visible URLs stay unprefixed. These rewrites pick
  // the language from the everybird-lang cookie, else Accept-Language's first tag, else English (src/i18n/routes.ts).
  // beforeFiles, so they run ahead of the filesystem and Vercel's router applies them (no Proxy, no Function).
  async rewrites() {
    return { beforeFiles: langRewrites(), afterFiles: [], fallback: [] };
  },
  // A share link's token is the birder's list: the Referer is the origin only, everywhere. The root layout's metadata
  // sets the same policy as a <meta> tag; the header doesn't depend on where streaming metadata puts that tag.
  async headers() {
    // The site icons and link previews (public/og) change only with a redesign: browsers keep them a week instead of
    // revalidating every visit.
    const icons = [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }];
    return [
      { source: "/:path*", headers: [{ key: "Referrer-Policy", value: "strict-origin" }] },
      { source: "/icons/:file*", headers: icons },
      { source: "/favicon.ico", headers: icons },
      { source: "/og/:file*", headers: icons },
    ];
  },
};

export default nextConfig;
