import type { Metadata } from 'next'
import Link from '@/components/app/IntentLink'
import { ArrowRight } from '@phosphor-icons/react/ssr'
import { SampleDemo } from '@/components/app/SampleDemo'
import { CompareWithMine } from '@/components/compare/CompareWithMine'
import { SharedView } from '@/components/app/SharedView'
import { FullNavigation } from '@/components/app/FullNavigation'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import { TrackVisit } from '@/components/app/VisitTracker'
import { getMessages, langParam } from '@/i18n/server'
import type { Ui } from '@/i18n/messages/en'
import { ogDescription, ogName, ogTitle, tryDecodeShare } from '@/lib/share/og'
import { OG_LOCALE } from '@/lib/site-meta'
import '@/components/app/app.css'

type Props = { params: Promise<{ lang: string; token: string }> }

// Its metadata in the page's language, from the token and og.ts (the same strings as the page's h1 and lede).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await langParam(params)
  const t = getMessages(lang).ui
  const p = tryDecodeShare((await params).token)
  const title = ogTitle(p, t)
  const description = ogDescription(t)
  // og:image comes from ./opengraph-image (and twitter:image from ./twitter-image), under this page's path, so its URL
  // is language-keyed (/pt/s/<token>/opengraph-image…); the card type is set here.
  // noindex, and no canonical or og:url: the token is the birder's whole list, so it goes in no URL here but the
  // preview image's own (which link previews need). robots.txt also disallows /s/; it is never in the sitemap.
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website', siteName: 'Everybird', url: null, locale: OG_LOCALE[lang] },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/** "Make yours", as on the landing page: the same words, the same place to start. */
function MakeYours({ big, t }: { big?: boolean; t: Ui }) {
  return (
    <Link className={big ? 'eb-btn eb-btn-big eb-hero-cta' : 'eb-btn'} href="/settings">
      {t.landing.makeYours}
      <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
    </Link>
  )
}

/**
 * A shared collage, outside the app's store (it never reads or writes the visitor's own list), under the same top
 * bar. A cold visitor reads whose list it is, what Everybird is and where to make their own before the first bird.
 * No Cloudflare beacon here (it can't redact the token from the URL), and every link out is a full page load
 * (FullNavigation), so the beacon never runs in a document that has shown a token. The visit is counted as 'shared' only.
 */
export default async function SharedPage({ params }: Props) {
  // The page's own words in its language; the link's title and the metadata above are og.ts's, from the same strings.
  const t = getMessages(await langParam(params)).ui
  const { token } = await params
  const payload = tryDecodeShare(token)
  if (!payload) {
    return (
      <>
        <TopBar />
        <main className="eb-page eb-page-collage eb-page-titled">
          <div className="eb-hero">
            <div className="eb-hero-text">
              <div className="eb-pagehead-row"><h1 className="eb-pagehead-title">{t.shared.brokenTitle}</h1></div>
              <p className="eb-hero-lede" role="alert">{t.shared.brokenLede}</p>
            </div>
            <MakeYours big t={t} />
          </div>
          <SampleDemo />
        </main>
        <SiteFooter />
        <FullNavigation />
        <TrackVisit page="shared" />
      </>
    )
  }
  return (
    <>
      <TopBar />
      <main className="eb-page eb-page-collage eb-page-titled">
        <div className="eb-hero">
          <div className="eb-hero-text">
            <div className="eb-pagehead-row"><h1 className="eb-pagehead-title">{ogName(payload, t)}</h1></div>
            <p className="eb-hero-lede">{ogDescription(t)}</p>
          </div>
          <div className="eb-compare-ctas">
            <CompareWithMine path={`/s/${token}`} />
            <MakeYours big t={t} />
          </div>
        </div>
        <SharedView payload={payload} />
        <div className="eb-endcta">
          <p className="eb-lede-sm">{t.shared.endCta}</p>
          <MakeYours t={t} />
        </div>
      </main>
      <SiteFooter />
      <FullNavigation />
      <TrackVisit page="shared" />
    </>
  )
}
