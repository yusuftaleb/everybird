import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/ssr'
import { SampleDemo } from '@/components/app/SampleDemo'
import { SharedView } from '@/components/app/SharedView'
import { SiteFooter } from '@/components/app/SiteFooter'
import { TopBar } from '@/components/app/TopBar'
import { OG_DESCRIPTION, ogName, ogTitle, tryDecodeShare } from '@/lib/share/og'
import '@/components/app/app.css'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = tryDecodeShare((await params).token)
  const title = ogTitle(p)
  // og:image comes from ./opengraph-image (and twitter:image from ./twitter-image); the card type is set here.
  return {
    title,
    description: OG_DESCRIPTION,
    robots: { index: false },
    openGraph: { title, description: OG_DESCRIPTION, type: 'website', siteName: 'Everybird' },
    twitter: { card: 'summary_large_image', title, description: OG_DESCRIPTION },
  }
}

/** "Make yours", as on the landing page: the same words, the same place to start. */
function MakeYours({ big }: { big?: boolean }) {
  return (
    <Link className={big ? 'eb-btn eb-btn-big' : 'eb-btn'} href="/settings">
      Make yours
      <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
    </Link>
  )
}

/**
 * A shared collage, outside the app's store (it never reads or writes the visitor's own list), under the same top
 * bar. A cold visitor reads whose list it is, what Everybird is and where to make their own before the first bird.
 */
export default async function SharedPage({ params }: Props) {
  const payload = tryDecodeShare((await params).token)
  if (!payload) {
    return (
      <>
        <TopBar />
        <main className="eb-page eb-page-collage">
          <div className="eb-hero">
            <div className="eb-hero-text">
              <h1 className="eb-hero-title">This link didn&apos;t open</h1>
              <p className="eb-hero-lede" role="alert">It may be cut off, or made by a newer Everybird. Everybird turns a birder&apos;s life list into a sticker collage.</p>
            </div>
            <MakeYours big />
          </div>
          <SampleDemo />
        </main>
        <SiteFooter />
      </>
    )
  }
  return (
    <>
      <TopBar />
      <main className="eb-page eb-page-collage">
        <div className="eb-hero">
          <div className="eb-hero-text">
            <h1 className="eb-hero-title">{ogName(payload)}</h1>
            <p className="eb-hero-lede">{OG_DESCRIPTION}</p>
          </div>
          <MakeYours big />
        </div>
        <SharedView payload={payload} />
        <div className="eb-endcta">
          <p className="eb-lede-sm">Your list, from eBird, iNaturalist or by hand, as a collage like this.</p>
          <MakeYours />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
