'use client'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { stripBracket } from '@/lib/import/places'
import { loadSamplePack, type SamplePack } from '@/lib/list/sample-pack'
import { initialState, makeReducer } from '@/lib/list/store'
import { CollageView } from './CollageView'

/**
 * The landing page's live demo: the pre-packed sample (public/data/sample-pack.v1.json) in its own store, never
 * saved. It needs neither the species file nor the layout worker to show its first collage; filters and True size
 * then run on the worker as anywhere else.
 */
export function SampleDemo() {
  const [pack, setPack] = useState<SamplePack | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadSamplePack().then((p) => { if (live) setPack(p) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  if (failed) return <p className="eb-error eb-notice" role="alert">Couldn&apos;t load the sample collage. Check your connection and reload the page.</p>
  if (!pack) return <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
  return <Loaded pack={pack} />
}

function Loaded({ pack }: { pack: SamplePack }) {
  const { species, regions } = pack
  const reducer = useMemo(
    () => makeReducer({ species, countryName: (iso) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso) }),
    [species, regions],
  )
  const [state, dispatch] = useReducer(reducer, undefined, () => reducer(initialState(), { type: 'restore', saved: pack.saved }))
  return (
    <CollageView
      state={state}
      dispatch={dispatch}
      species={species}
      regions={regions}
      label="Sample collage"
      statsPrefix="Sample: a demo birder's life list"
      seed={pack.seed}
    />
  )
}
