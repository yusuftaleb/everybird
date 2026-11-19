import type { Metadata } from 'next'
import Link from '@/components/app/IntentLink'
import { ArrowRight } from '@phosphor-icons/react/ssr'
import { CompareView } from '@/components/compare/CompareView'
import { FullNavigation } from '@/components/app/FullNavigation'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import { TrackVisit } from '@/components/app/VisitTracker'
import { fmt } from '@/i18n/core'
import { getMessages, langParam } from '@/i18n/server'
import { decodeCompare, type SharePayload } from '@/lib/share/link'
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
  const title = lists ? `${fmt(t.compare.sharedTitle, { n: lists.length })} · Everybird` : 'Everybird'
  const description = t.shared.lede
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
 * own list). Like the shared view: no Cloudflare beacon, every link out a full page load, counted as a 'shared' visit.
 */
export default async function ComparedPage({ params }: Props) {
  const t = getMessages(await langParam(params)).ui
  const lists = tryDecode((await params).token)
  return (
    <>
      <TopBar />
      <main className="eb-page eb-page-collage">
        <div className="eb-hero">
          <div className="eb-hero-text">
            <h1 className="eb-hero-title">{lists ? fmt(t.compare.sharedTitle, { n: lists.length }) : t.shared.brokenTitle}</h1>
            <p className="eb-hero-lede" role={lists ? undefined : 'alert'}>{lists ? t.shared.lede : t.shared.brokenLede}</p>
          </div>
          <Link className="eb-btn eb-btn-big eb-hero-cta" href="/settings">
            {t.landing.makeYours}
            <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
          </Link>
        </div>
        {lists && <CompareView lists={lists} />}
      </main>
      <SiteFooter />
      <FullNavigation />
      <TrackVisit page="shared" />
    </>
  )
}
