import type { Metadata } from 'next'
import Link from 'next/link'
import { SharedView } from '@/components/app/SharedView'
import { SiteFooter } from '@/components/app/SiteFooter'
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

export default async function SharedPage({ params }: Props) {
  const payload = tryDecodeShare((await params).token)
  if (!payload) {
    return (
      <>
        <main className="eb-page">
          <header className="eb-head">
            <h1 className="eb-title">Everybird</h1>
            <p className="eb-tagline" role="alert">This link is broken or from a newer Everybird</p>
          </header>
          <div className="eb-hero">
            <Link className="eb-btn eb-btn-big" href="/">Make your own</Link>
          </div>
        </main>
        <SiteFooter />
      </>
    )
  }
  const count = payload.birds.length
  return (
    <>
      <main className="eb-page">
        <header className="eb-head">
          <h1 className="eb-title">{ogName(payload)}</h1>
          <p className="eb-tagline">{count.toLocaleString('en-US')} species</p>
        </header>
        <SharedView payload={payload} />
        <div className="eb-hero">
          <Link className="eb-btn eb-btn-big" href="/">Make your own</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
