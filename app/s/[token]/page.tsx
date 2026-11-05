import type { Metadata } from 'next'
import Link from 'next/link'
import { SharedView } from '@/components/app/SharedView'
import { SiteFooter } from '@/components/app/SiteFooter'
import { decodeShare, type SharePayload } from '@/lib/share/link'
import '@/components/app/app.css'

type Props = { params: Promise<{ token: string }> }

function tryDecode(token: string): SharePayload | null {
  try {
    return decodeShare(decodeURIComponent(token))
  } catch {
    return null
  }
}
const title = (p: SharePayload | null) => (p ? (p.name ? `${p.name}'s Everybird` : 'An Everybird') : 'Everybird')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = tryDecode((await params).token)
  return { title: title(p), robots: { index: false } }
}

export default async function SharedPage({ params }: Props) {
  const payload = tryDecode((await params).token)
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
          <h1 className="eb-title">{title(payload)}</h1>
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
