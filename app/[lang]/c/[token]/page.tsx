import type { Metadata } from 'next'
import Link from '@/components/app/IntentLink'
import { ArrowRight } from '@phosphor-icons/react/ssr'
import { CompareView } from '@/components/compare/CompareView'
import { SampleDemo } from '@/components/app/SampleDemo'
import { CompareWithMine } from '@/components/compare/CompareWithMine'
import { FullNavigation } from '@/components/app/FullNavigation'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import { TrackVisit } from '@/components/app/VisitTracker'
import { fmt } from '@/i18n/core'
import { getMessages, langParam } from '@/i18n/server'
import { COMPARE_MAX, decodeCompare, type SharePayload } from '@/lib/share/link'
import { SPECIES_FILES, preloadData } from '@/lib/data-preload'
import { OG_LOCALE } from '@/lib/site-meta'
import '@/components/app/app.css'

type Props = { params: Promise<{ lang: string; token: string }> }

function tryDecode(token: string): SharePayload[] | null {
  try {
    return decodeCompare(decodeURIComponent(token))
  } catch {
    return null
  }
}

// As /s/[token]: noindex, and no canonical or og:url, since the token holds every birder's list.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await langParam(params)
  const t = getMessages(lang).ui
  const lists = tryDecode((await params).token)
  const title = `${lists ? fmt(t.compare.sharedTitle, { n: lists.length }) : t.shared.brokenTitle} · Everybird`
  const description = lists ? t.compare.ledeTheirs : t.shared.lede
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website', siteName: 'Everybird', url: null, locale: OG_LOCALE[lang] },
    twitter: { card: 'summary', title, description },
  }
}

/**
 * A comparison link: the lists it carries, compared, outside the app's store (it never reads or writes the visitor's
 * own list; "Compare with mine" takes the link to /compare, which adds it). Like the shared view: no Cloudflare beacon, every link out a full page load, counted as a 'shared' visit.
 */
export default async function ComparedPage({ params }: Props) {
  const t = getMessages(await langParam(params)).ui
  const { token } = await params
  const lists = tryDecode(token)
  // The comparison's species file (CompareView draws no collage, so no regions or masks), beside the page's JavaScript.
  if (lists) preloadData(SPECIES_FILES)
  return (
    <>
      <TopBar />
      <main className="eb-page eb-page-collage eb-page-titled">
        <div className="eb-hero">
          <div className="eb-hero-text">
            <div className="eb-pagehead-row"><h1 className="eb-pagehead-title">{lists ? fmt(t.compare.sharedTitle, { n: lists.length }) : t.shared.brokenTitle}</h1></div>
            {/* Its line says what the page does and that its chips and circles can be pressed. */}
            <p className="eb-hero-lede" role={lists ? undefined : 'alert'}>{lists ? t.compare.ledeTheirs : t.shared.brokenLede}</p>
          </div>
          <div className="eb-compare-ctas">
            {/* The visitor's own list joins these, while a comparison link can still hold it. */}
            {lists && lists.length < COMPARE_MAX && <CompareWithMine path={`/c/${token}`} />}
            <Link className="eb-btn eb-btn-big eb-hero-cta" href="/settings">
              {t.landing.makeYours}
              <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
            </Link>
          </div>
        </div>
        {/* A broken link shows the sample, as a broken /s/ does. */}
        {lists ? <CompareView lists={lists} /> : <SampleDemo />}
      </main>
      <SiteFooter />
      <FullNavigation />
      <TrackVisit page="shared" />
    </>
  )
}
