'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, DownloadSimple } from '@phosphor-icons/react'
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { downloadBlob } from '@/lib/download'
import { loadRegions } from '@/lib/import/places'
import type { ListEntry } from '@/lib/list/model'
import { compareGroups, compareTable, groupPayload, type CompareGroup } from '@/lib/share/compare'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import { shareTitle } from '@/lib/share/og'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useLoadNames, useNames } from '@/lib/species/use-names'
import type { Regions } from '@/lib/species/types'
import { currentTheme } from '@/lib/theme'
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
  if (you && labels.length === 2) return t.compare.need
  return fmt(t.compare.only, { name: labels[g.who] })
}

/** The comparison card's title ("Ada's birds & Sam's life list") and counts line ("Both of you: 412 · Only Ada's
 *  birds: 38 · …"), by the lists' titles, never "you": the image travels. */
export function cardText(lists: readonly SharePayload[], labels: readonly string[], t: Ui): { name: string; label: string } {
  const label = compareGroups(lists)
    .map((g) => fmt(t.compare.cardCount, { label: groupLabel(g, labels, false, t), n: formatInt(g.codes.length, t.num) }))
    .join(' · ')
  return { name: labels.join(' & '), label }
}

const entriesOf = (p: SharePayload): ListEntry[] =>
  p.birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { date: ymToDate(b.ym, b.yearOnly) } : {}), heard: false, dead: false, media: false, sources: ['ebird'] }))

/**
 * Two or more lists compared: a chip per group (on every list, then each list's own birds; for the viewer and one
 * other list, the birds they still need first) with its count, and the chosen group as a collage or list, with that
 * list's dates and places. With three or more lists, "Every bird" is the species × people table. `you`: the first list
 * is the viewer's own. `labels`: the lists' names for this comparison (default listLabels). `share`: the page's own
 * sharing controls, beside the card's download. Reads and writes nothing of the visitor's saved list.
 */
export function CompareView({ lists, you = false, labels: named, share }: { lists: readonly SharePayload[]; you?: boolean; labels?: readonly string[]; share?: ReactNode }) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex; regions: Regions } | null>(null)
  const [failed, setFailed] = useState(false)
  const [at, setAt] = useState<number | 'table'>(0)
  const [card, setCard] = useState<'idle' | 'busy' | 'failed'>('idle')
  useEffect(() => {
    let live = true
    Promise.all([loadSpecies(), loadRegions()]).then(([species, regions]) => { if (live) setData({ species, regions }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const groups = useMemo(() => compareGroups(lists, you), [lists, you])
  const fallback = listLabels(lists, t)
  const labels = named ?? fallback
  const table = lists.length >= 3
  const rows = useMemo(() => (table ? compareTable(lists) : []), [table, lists])
  const g = groups[Math.min(at === 'table' ? 0 : at, groups.length - 1)]
  const showTable = table && at === 'table'
  const payload = useMemo(() => groupPayload(lists, g), [lists, g])

  const downloadCard = async () => {
    if (!data) return
    setCard('busy')
    try {
      const { renderShareImage } = await import('@/lib/share/image')
      const all = groups.find((x) => x.who === 'all')!
      const { name, label } = cardText(lists, labels, t)
      const blob = await renderShareImage({
        format: 'post', entries: entriesOf(groupPayload(lists, all)), species: data.species, name, filterLabel: label,
        theme: currentTheme(), latest: false, strings: t, nameOf: displayName,
      })
      downloadBlob(blob, 'everybird-compare.png')
      setCard('idle')
    } catch {
      setCard('failed')
    }
  }

  if (failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  return (
    <div className="eb-compare">
      <div className="eb-compare-share">
        {share}
        <button type="button" className="eb-btn eb-btn-quiet" disabled={!data || card === 'busy'} onClick={() => void downloadCard()} data-testid="compare-card">
          <DownloadSimple aria-hidden="true" focusable="false" />
          {t.compare.card}
        </button>
      </div>
      <p className="eb-status" role="status" data-testid="compare-card-status">{card === 'failed' ? t.share.imageFailed : ''}</p>
      <div className="eb-compare-groups" role="group" aria-label={t.compare.groups} data-testid="compare-groups">
        {groups.map((x, i) => (
          <Chip key={i} label={groupLabel(x, labels, you, t)} count={x.codes.length} selected={!showTable && x === g} onClick={() => setAt(i)} testId={`compare-group-${x.who}`} />
        ))}
        {table && <Chip label={t.compare.every} count={rows.length} selected={showTable} onClick={() => setAt('table')} testId="compare-group-table" />}
      </div>
      {!data ? (
        <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
      ) : showTable ? (
        <CompareTable rows={rows} labels={labels} species={data.species} />
      ) : g.codes.length ? (
        // A new group starts with no filter, as a new list does.
        <SharedCollage key={`${idOf(lists)}:${at}`} payload={payload} species={data.species} regions={data.regions} />
      ) : (
        <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
      )}
    </div>
  )
}

const NO_LIST: ListEntry[] = []

/** The species × people table: a row per bird (in taxonomic order), a column per list, a mark where the list has it. */
function CompareTable({ rows, labels, species }: { rows: { code: string; on: boolean[] }[]; labels: readonly string[]; species: SpeciesIndex }) {
  const { t } = useI18n()
  useLoadNames(NO_LIST) // the collage isn't mounted while the table shows, so the names are loaded here
  useNames()
  const shown = useMemo(
    () => rows.flatMap((r) => { const row = species.byCode.get(r.code); return row ? [{ ...r, row }] : [] }).sort((a, b) => a.row.to - b.row.to),
    [rows, species],
  )
  return (
    <div className="eb-compare-table" role="region" aria-label={t.compare.tableCaption} tabIndex={0} data-testid="compare-table">
      <table>
        <caption className="eb-sr">{t.compare.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.compare.bird}</th>
            {labels.map((l, i) => <th key={i} scope="col">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ code, on, row }) => (
            <tr key={code}>
              <th scope="row">{displayName(row)}</th>
              {on.map((has, i) => (
                <td key={i}>
                  {has && (
                    <>
                      <Check aria-hidden="true" focusable="false" weight="bold" />
                      <span className="eb-sr">{t.compare.onList}</span>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
