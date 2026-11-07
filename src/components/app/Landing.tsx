'use client'
import { ArrowRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { SampleDemo } from './SampleDemo'
import { Welcome } from './Welcome'
import './app.css'

/** `/` for a visitor without a list: one line of what Everybird is, "Make yours", and the sample collage leading; on
 * the first visit, the welcome over it. */
export function Landing() {
  const eb = useEverybirdContext()
  return (
    <main className="eb-page eb-page-collage eb-page-landing">
      <div className="eb-hero">
        <div className="eb-hero-text">
          <h1 className="eb-hero-title">A lifetime of birds.</h1>
          <p className="eb-hero-lede">Look how far you&apos;ve come. Bring your eBird or iNaturalist list, or tick birds off by hand, and see every species on it as a sticker.</p>
        </div>
        <Link href="/settings" className="eb-btn eb-btn-big eb-hero-cta">
          Make yours
          <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
        </Link>
      </div>
      {/* The pre-packed sample needs no bird data, so a failed load says nothing here (Settings says it). */}
      <AppNotices eb={eb} memory={false} failure={false} />
      <SampleDemo />
      <Welcome />
    </main>
  )
}
