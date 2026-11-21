'use client'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { baseOfLang } from '@/lib/species/name-locales'
import { seedNames } from '@/lib/species/names'
import { loadSamplePack, type SamplePack } from '@/lib/list/sample-pack'
import { initialState, makeReducer } from '@/lib/list/store'
import { CollageView } from './CollageView'

/**
 * The landing page's live demo: the pre-packed sample (public/data/sample-pack.v1.json) in its own store, never
 * saved, and a demo: no Share or Print. It needs neither the species file nor the layout worker to show its first collage; filters and True size
 * then run on the worker as anywhere else.
 */
export function SampleDemo() {
  const [pack, setPack] = useState<SamplePack | null>(null)
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()
  useEffect(() => {
    let live = true
    loadSamplePack().then((p) => { if (live) setPack(p) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  if (failed) return <p className="eb-error eb-notice" role="alert">{t.landing.sampleFailed}</p>
  if (!pack) return <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
  return <Loaded pack={pack} />
}

function Loaded({ pack }: { pack: SamplePack }) {
  const { species, regions } = pack
  const { t, lang } = useI18n()
  // The sample reads in the UI language from its own base names until the full names file arrives (then that replaces them).
  useEffect(() => {
    const base = baseOfLang(lang)
    const loc = base ? pack.loc?.[base] : undefined
    if (base && loc) seedNames({ v: 1, locale: base, taxonomy: '', names: loc.names, fam: loc.fam })
  }, [pack, lang])
  const reducer = useMemo(
    () => makeReducer({ species }),
    [species],
  )
  const [state, dispatch] = useReducer(reducer, undefined, () => reducer(initialState(), { type: 'restore', saved: pack.saved }))
  return (
    <CollageView
      state={state}
      dispatch={dispatch}
      species={species}
      regions={regions}
      label={t.collage.regionSample}
      statsPrefix={t.landing.samplePrefix}
      seed={pack.seed}
    />
  )
}
