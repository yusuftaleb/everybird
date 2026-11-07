import { SITE_ICONS } from "@/lib/site-icons";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { SHARE_ORIGIN } from "@/lib/share/origin";
import { pageSeo, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-meta";
import { STICKER_READY_SCRIPT } from "@/lib/sticker-ready";
import { THEME_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute og:image URLs. Production: the real origin. Vercel preview/other environments: that deployment's own URL
  // (previews must not point at production). Local dev: undefined, so Next uses the request origin (localhost).
  metadataBase:
    process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
      ? new URL(SHARE_ORIGIN)
      : process.env.VERCEL_ENV && process.env.VERCEL_URL
        ? new URL(`https://${process.env.VERCEL_URL}`)
        : undefined,
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // The landing page's canonical, Open Graph and Twitter card. Every page that sets its own title sets its own copy of
  // these (about, settings) or replaces them (/s/<token>, which also says noindex), so none inherits "/".
  ...pageSeo("/", SITE_NAME, SITE_DESCRIPTION),
  // A share link's token is the birder's list: never let it leave as a Referer, not even to our own pages
  // (analytics beacons send one). Origin only, everywhere. No analytics script here: Cloudflare Web Analytics loads from
  // app/(app)/layout.tsx only, so a shared view (/s/<token>) never loads it.
  referrer: "strict-origin",
  icons: SITE_ICONS,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Light unless the visitor chose dark on this device: the inline script sets data-theme before the first paint
    // (src/lib/theme.ts), so suppressHydrationWarning lets React keep the attribute it finds.
    <html lang="en" className={geistMono.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: STICKER_READY_SCRIPT }} />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        {/* Satoshi and Cabinet Grotesk come from Fontshare; never commit the files. One stylesheet per family: Fontshare's
            API now answers a two-family request with the first family only (Cabinet was never loading), and Satoshi has
            no 600 (400, 500 and 700 here; a 600 rule draws the nearest, 700). */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
