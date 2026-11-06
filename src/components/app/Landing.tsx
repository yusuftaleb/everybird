'use client'
import { ArrowRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { SampleDemo } from './SampleDemo'
import './app.css'

/** `/`: what Everybird is, a live sample collage, "Make yours" and, for a returning birder, "Open my collage". */
export function Landing() {
  const eb = useEverybirdContext()
  const { data, dots, mine, meta } = eb
  return (
    <main className="eb-page">
      <header className="eb-head">
        <h1 className="eb-title">Everybird</h1>
        <p className="eb-tagline">Every bird you&apos;ve ever seen.</p>
      </header>
      <AppNotices eb={eb} memory={false} />
      <div className="eb-hero">
        <p className="eb-lede">
          Your existing record, made beautiful: every bird on your life list as a sticker, sized by its body mass.
          Bring an eBird file or an iNaturalist username, or tick birds off by hand.
        </p>
        <div className="eb-row">
          <Link href="/make" className="eb-btn eb-btn-big">
            Make yours
            <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
          </Link>
          {meta.ready && mine && <Link href="/my" className="eb-btn eb-btn-big eb-btn-quiet">Open my collage</Link>}
        </div>
      </div>
      <figure className="eb-sample">
        <figcaption className="eb-mono">Sample · Yusuf&apos;s life list. Try the filters.</figcaption>
        {data ? <SampleDemo species={data.species} regions={data.regions} dots={dots} /> : !eb.failed && <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />}
      </figure>
    </main>
  )
}
