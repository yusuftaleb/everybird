import { SITE_ICONS } from "@/lib/site-icons";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { SHARE_ORIGIN } from "@/lib/share/origin";
import { pageSeo, SITE_NAME } from "@/lib/site-meta";
import { STICKER_READY_SCRIPT } from "@/lib/sticker-ready";
import { STICKER_BASE } from "@/lib/sticker-url";
import { DATA_BASE } from "@/lib/data-url";
import { THEME_SCRIPT } from "@/lib/theme";
import { I18nProvider } from "@/i18n/I18nProvider";
import { HTML_LANG, LANGS } from "@/i18n/langs";
import { getMessages, langParam } from "@/i18n/server";
import "@/styles/globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  // Latin is the only file preloaded on every page. The generated CSS still declares every subset's unicode-range face
  // (latin-ext for Polish's ą, ć, ę, ł, ń, ś, ź, ż, cyrillic for Russian, in the mono labels), so a page that uses
  // those letters fetches them when it draws them: `subsets` only picks what is preloaded.
  subsets: ["latin"],
});

/**
 * The Noto family each non-Latin language draws its letters in (tokens.css puts it after the Latin fonts, by :lang).
 * Google's CSS, linked from that language's pages only: through next/font every page would carry the @font-face rules
 * of all four (the CJK families' unicode-range slices are about 340 KB of CSS each), and English would pay for them.
 */
/** The data host when it isn't this site (production: the sticker host's /data). */
const DATA_ORIGIN = /^https?:\/\//.test(DATA_BASE) ? new URL(DATA_BASE).origin : null;

const NOTO: Partial<Record<string, string>> = { ru: "Noto+Sans", ja: "Noto+Sans+JP", "zh-Hans": "Noto+Sans+SC", "zh-Hant": "Noto+Sans+TC" };

/** The site's metadata in the page's language (`page.meta`); pages that set their own title replace the SEO part. */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langParam(params);
  const { title, description, imageAlt } = getMessages(lang).page.meta;
  return { ...BASE_METADATA, title, description, ...pageSeo("/", title, description, lang, imageAlt) };
}

const BASE_METADATA: Metadata = {
  // Absolute og:image URLs. Production: the real origin. Vercel preview/other environments: that deployment's own URL
  // (previews must not point at production). Local dev: undefined, so Next uses the request origin (localhost).
  metadataBase:
    process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
      ? new URL(SHARE_ORIGIN)
      : process.env.VERCEL_ENV && process.env.VERCEL_URL
        ? new URL(`https://${process.env.VERCEL_URL}`)
        : undefined,
  title: SITE_NAME,
  applicationName: SITE_NAME,
  // generateMetadata adds the description and the landing page's canonical, Open Graph and Twitter card. Every page
  // that sets its own title sets its own copy of these (about, settings) or replaces them (/s/<token>, which also says
  // noindex), so none inherits "/".
  // A share link's token is the birder's list: never let it leave as a Referer, not even to our own pages
  // (analytics beacons send one). Origin only, everywhere. No analytics script here: Cloudflare Web Analytics loads from
  // app/[lang]/(app)/layout.tsx only, so a shared view (/s/<token>) never loads it.
  referrer: "strict-origin",
  icons: SITE_ICONS,
};

/** One prerendered copy of every page per language; next.config.ts's rewrites (src/i18n/routes.ts) pick the copy for the
 *  unprefixed URL. No `dynamicParams = false`: it would reach /s/[token], whose tokens can't be listed. */
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const lang = await langParam(params);
  return (
    // Light unless the visitor chose dark on this device: the inline script sets data-theme before the first paint
    // (src/lib/theme.ts), so suppressHydrationWarning lets React keep the attribute it finds.
    <html lang={HTML_LANG[lang]} className={geistMono.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: STICKER_READY_SCRIPT }} />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        {/* Every data file (fetch: a CORS connection) and every sticker (<img>: a no-CORS one) comes from the sticker host:
            both connections are opened now, not after hydration. */}
        <link rel="preconnect" href={STICKER_BASE} crossOrigin="" />
        <link rel="preconnect" href={STICKER_BASE} />
        {DATA_ORIGIN && DATA_ORIGIN !== new URL(STICKER_BASE).origin && <link rel="preconnect" href={DATA_ORIGIN} crossOrigin="" />}
        {/* Satoshi and Cabinet Grotesk come from Fontshare; never commit the files. One stylesheet per family: Fontshare's
            API now answers a two-family request with the first family only (Cabinet was never loading), and Satoshi has
            no 600 (400, 500 and 700 here; a 600 rule draws the nearest, 700). */}
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap" />
        {/* The two most-used files, Satoshi 500 (body) and Cabinet Grotesk 700 (headings), fetched now rather than once
            the stylesheets above are parsed. These URLs follow Fontshare's current file names (copied from the CSS
            above, 2026-11-21): if Fontshare renames them the preload is wasted, never wrong; recopy them from the CSS. */}
        <link rel="preload" as="font" type="font/woff2" crossOrigin="" href="https://cdn.fontshare.com/wf/P2LQKHE6KA6ZP4AAGN72KDWMHH6ZH3TA/ZC32TK2P7FPS5GFTL46EU6KQJA24ZYDB/7AHDUZ4A7LFLVFUIFSARGIWCRQJHISQP.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="" href="https://cdn.fontshare.com/wf/XMXWOHABYLQDJ42L65EFRYNVRY37HQCB/B2O4O6V3JMFM2WDCYQI3A47L5U4THDUL/WN5274VQ3AUBDFP74GB4EC4XYJ3EKVNE.woff2" />
        {NOTO[lang] && (
          <>
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${NOTO[lang]}:wght@400;500;700&display=swap`} />
          </>
        )}
      </head>
      <body>
        <I18nProvider lang={lang} ui={getMessages(lang).ui}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
