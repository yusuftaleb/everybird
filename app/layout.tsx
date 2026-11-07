import { SITE_ICONS } from "@/lib/site-icons";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { SHARE_ORIGIN } from "@/lib/share/origin";
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
  title: "Everybird",
  description: "Look how far you've come. Bring your eBird or iNaturalist list, or tick birds off by hand, and see every species on it as a sticker.",
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
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        {/* Satoshi and Cabinet Grotesk come from Fontshare; never commit the files. */}
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&f[]=cabinet-grotesk@700&display=swap"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
