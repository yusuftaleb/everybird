'use client'
import { ArrowDown } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { ImportPanel } from '@/components/import/ImportPanel'
import { loadCountryDots, loadRegions } from '@/lib/import/places'
import { useEverybird } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { CountryDots, Regions } from '@/lib/species/types'
import { CollagePage, MemoryNotice } from './CollagePage'
import { RestoreBackup } from './RestoreBackup'
import { SampleDemo } from './SampleDemo'
import { SiteFooter } from './SiteFooter'
import './app.css'

/** Anything the birder brought in, matched or not (an import of only unmatched rows still shows its report). */
export function hasData(s: Saved): boolean {
  return s.records.ebird.length + s.records.inat.length + s.records.manual.length + s.edits.added.length + s.unmatched.length > 0
}

/** The one page: the landing (sample collage and the three ways in) until there is a list, then the collage page. */
export function Home() {
  const [state, dispatch, meta] = useEverybird()
  const [regions, setRegions] = useState<Regions | null>(null)
  const [dots, setDots] = useState<CountryDots | undefined>(undefined)
  const [regionsFailed, setRegionsFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadRegions().then((r) => { if (live) setRegions(r) }, () => { if (live) setRegionsFailed(true) })
    loadCountryDots().then((d) => { if (live) setDots(d) }, () => {}) // the map is optional; chips still work
    return () => { live = false }
  }, [])

  const data = meta.ready && meta.species && regions ? { species: meta.species, regions } : null
  const mine = hasData(state.saved)

  const makeYours = () => {
    const el = document.getElementById('make-yours')
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    el?.focus({ preventScroll: true })
  }

  return (
    <>
      <main className="eb-page">
        <header className="eb-head">
          <h1 className="eb-title">Everybird</h1>
          <p className="eb-tagline">Every bird you&apos;ve ever seen.</p>
        </header>

        {meta.forgetOutcome === 'failed' && (
          <p className="eb-error eb-notice" role="alert">Couldn&apos;t clear this device&apos;s copy. Clear this site&apos;s data in your browser settings to remove it.</p>
        )}
        {(meta.error || regionsFailed) && (
          <p className="eb-error eb-notice" role="alert">Couldn&apos;t load the bird data. Check your connection and reload the page.</p>
        )}

        {!data ? (
          !(meta.error || regionsFailed) && <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
        ) : mine ? (
          <CollagePage state={state} dispatch={dispatch} species={data.species} regions={data.regions} dots={dots} />
        ) : (
          <>
            <div className="eb-hero">
              <p className="eb-lede">
                Your existing record, made beautiful: every bird on your life list as a sticker, sized by its body mass.
                Bring an eBird file or an iNaturalist username, or tick birds off by hand.
              </p>
              <button type="button" className="eb-btn eb-btn-big" onClick={makeYours}>
                Make yours
                <ArrowDown aria-hidden="true" focusable="false" weight="bold" />
              </button>
            </div>
            <figure className="eb-sample">
              <figcaption className="eb-mono">Sample · Yusuf&apos;s life list. Try the filters.</figcaption>
              <SampleDemo species={data.species} regions={data.regions} dots={dots} />
            </figure>
            <ImportPanel
              saved={state.saved}
              dispatch={dispatch}
              species={data.species}
              regions={data.regions}
              hasList={false}
              footer={
                <>
                  {state.persistence === 'memory-only' && <MemoryNotice />}
                  <div className="eb-tools">
                    <span className="eb-note">Moving from another device?</span>
                    <RestoreBackup onRestore={(s) => dispatch({ type: 'restore', saved: s })} />
                  </div>
                </>
              }
            />
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
