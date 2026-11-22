'use client'
import { ArrowRight } from '@/components/phosphor-icons'
import { useState } from 'react'
import { onIntent, warmAddBirds } from '@/lib/prefetch'
import { toured } from '@/lib/tour'
import { useI18n } from '@/i18n/I18nProvider'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { SampleDemo } from './SampleDemo'
import { Tour } from './Tour'
import { Welcome } from './Welcome'
import './app.css'

/** `/` for a visitor without a list: one line of what Everybird is, "Make yours" (`onAdd`, the Add birds dialog), and
 * the sample collage leading; on the first visit, the welcome over it, whose "Explore the sample" starts the tour. */
export function Landing({ onAdd }: { onAdd: () => void }) {
  const eb = useEverybirdContext()
  const { t } = useI18n()
  const [touring, setTouring] = useState(false)
  return (
    <main className="eb-page eb-page-collage eb-page-landing eb-page-titled">
      <div className="eb-hero">
        <div className="eb-hero-text">
          <div className="eb-pagehead-row"><h1 className="eb-pagehead-title">{t.landing.title}</h1></div>
          <p className="eb-hero-lede">{t.landing.lede}</p>
        </div>
        <button type="button" className="eb-btn eb-btn-big eb-hero-cta" aria-haspopup="dialog" onClick={onAdd} {...onIntent(warmAddBirds)}>
          {t.landing.makeYours}
          <ArrowRight aria-hidden="true" focusable="false" weight="bold" />
        </button>
      </div>
      {/* The pre-packed sample needs no bird data, so a failed load says nothing here (Settings says it). */}
      <AppNotices eb={eb} memory={false} failure={false} />
      {/* The demo's species counts and controls describe a sample, not the product's search result. */}
      <div data-nosnippet style={{ display: 'contents' }}><SampleDemo /></div>
      <Welcome onExplore={() => setTouring(!toured())} onAdd={onAdd} />
      {touring && <Tour onOwn={onAdd} onEnd={() => setTouring(false)} />}
    </main>
  )
}
