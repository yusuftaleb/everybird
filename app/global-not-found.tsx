import type { Metadata } from "next";
import Link from "@/components/app/IntentLink";
import { THEME_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";
import "@/components/app/app.css";

// A URL no route matches. The root layout sits under app/[lang], so this page brings its own document (Next skips the
// layouts): English, the site's styles, and the visitor's theme before the first paint (src/lib/theme.ts).
export const metadata: Metadata = {
  title: "Page not found · Everybird",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap" />
      </head>
      <body>
        <main className="eb-page eb-page-titled">
          <div className="eb-hero">
            <div className="eb-hero-text">
              <div className="eb-pagehead-row"><h1 className="eb-pagehead-title">This page isn&apos;t here</h1></div>
              <p className="eb-hero-lede">The address may be mistyped, or the page has moved.</p>
            </div>
            <Link className="eb-btn" href="/">Go to Everybird</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
