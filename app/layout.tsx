import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Geist_Mono } from "next/font/google";
import { SHARE_ORIGIN } from "@/lib/share/origin";
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
  description: "Every bird you've ever seen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistMono.variable}>
      <head>
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
        {/* Cookieless visit counts and three anonymous events (src/lib/analytics.ts). Only on Vercel, where
            /_vercel/insights exists: elsewhere (dev, tests, a local production build) nothing loads and track() is a no-op. */}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
