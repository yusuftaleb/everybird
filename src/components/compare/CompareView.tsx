'use client'
import { useEffect, useMemo, useState } from 'react'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { loadRegions } from '@/lib/import/places'
import { compareGroups, groupPayload, type CompareGroup } from '@/lib/share/compare'
import type { SharePayload } from '@/lib/share/link'
import { shareTitle } from '@/lib/share/og'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { Chip } from '@/components/filters/Chip'
import { SharedCollage } from '@/components/app/SharedView'
import './compare.css'

/** Each list's name in the groups: its title, else "Birder 2" by its place in the comparison. */
export function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
  return lists.map((p, i) => shareTitle(p, t) ?? fmt(t.compare.birder, { n: i + 1 }))
}

// A store per group and per set of lists: the key names the lists array itself, so new lists start a new store.
const ids = new WeakMap<object, number>()
let nextId = 0
const idOf = (o: object): number => {
  let i = ids.get(o)
  if (i === undefined) ids.set(o, (i = nextId++))
  return i
}

function groupLabel(g: CompareGroup, labels: readonly string[], you: boolean, t: Ui): string {
  if (g.who === 'all') return labels.length === 2 ? t.compare.both : t.compare.everyone
  if (you && g.who === 0) return t.compare.onlyYou
  return fmt(t.compare.only, { name: labels[g.who] })
}

/**
 * Two or more lists compared: a chip per group (on every list, then each list's own birds) with its count, and the
 * chosen group as a collage or list, with that list's dates and places. `you`: the first list is the viewer's own.
 * Reads and writes nothing of the visitor's saved list.
 */
export function CompareView({ lists, you = false }: { lists: readonly SharePayload[]; you?: boolean }) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex; regions: Regions } | null>(null)
  const [failed, setFailed] = useState(false)
  const [at, setAt] = useState(0)
  useEffect(() => {
    let live = true
    Promise.all([loadSpecies(), loadRegions()]).then(([species, regions]) => { if (live) setData({ species, regions }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const groups = useMemo(() => compareGroups(lists), [lists])
  const labels = listLabels(lists, t)
  const g = groups[Math.min(at, groups.length - 1)]
  const payload = useMemo(() => groupPayload(lists, g), [lists, g])

  if (failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  return (
    <div className="eb-compare">
      <div className="eb-compare-groups" role="group" aria-label={t.compare.groups} data-testid="compare-groups">
        {groups.map((x, i) => (
          <Chip key={i} label={groupLabel(x, labels, you, t)} count={x.codes.length} selected={x === g} onClick={() => setAt(i)} testId={`compare-group-${x.who}`} />
        ))}
      </div>
      {!data ? (
        <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
      ) : g.codes.length ? (
        // A new group starts with no filter, as a new list does.
        <SharedCollage key={`${idOf(lists)}:${at}`} payload={payload} species={data.species} regions={data.regions} />
      ) : (
        <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
      )}
    </div>
  )
}
