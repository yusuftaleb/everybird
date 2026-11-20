'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). Level one is every family, grey when none of its species is on the (filtered) list; a family opens to
// its genera and a genus to its species, whose tips on the list open the bird card. The drawing is aria-hidden; the
// rows beside it carry the names and counts, top to bottom in the tree's order. A group the tree splits is one marked row
// at the smallest branch holding it, "with" the groups inside it; more than two genera inside are a button opening their
// list (PickerSheet), each opening its own species. Under it: the key (the mark and the dotted line of a tip placed
// without genetic data), the birds the tree does not place, and the source with its licence. levels.ts and tree.ts
// hold the logic.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { PickerSheet } from '@/components/filters/PickerSheet'
import type { ListEntry } from '@/lib/list/model'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { genusOf, levelView, type Inside, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { loadTree } from '@/lib/tree/load'
import { ageTicks, formatAge, oldestLineage, type Tree, type TreeFile } from '@/lib/tree/tree'
import './tree.css'

export const AVES_URL = 'https://github.com/McTavishLab/AvesData'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'

type Loaded = { file: TreeFile; tree: Tree; species: SpeciesIndex }

type Props = {
  /** The filtered list. */
  entries: ListEntry[]
  sci: boolean
  /** Opens the bird card; `el` is the pressed button. */
  onPick: (code: string, el: HTMLElement) => void
  /** Told the level open whenever it changes, so Share can draw the same level. */
  onLevel?: (level: TreeLevel) => void
}

export default function TreeView({ entries, sci, onPick, onLevel }: Props) {
  const { t } = useI18n()
  useNames()
  const tt = t.collage.tree
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    // The whole taxonomy (cached; the landing sample's own index holds only its birds), for every family and its totals.
    Promise.all([loadTree(), loadSpecies()]).then(([d, species]) => { if (live) setData({ ...d, species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const [level, setLevel] = useState<TreeLevel>({})
  useEffect(() => onLevel?.(level), [level, onLevel])
  // The row whose list of genera inside is open.
  const [list, setList] = useState<string | null>(null)
  const onList = useMemo(() => new Set(entries.map((e) => e.code)), [entries])
  const species = data?.species
  const view = useMemo(() => (data ? levelView(data.tree, data.species, level, onList) : undefined), [data, level, onList])
  const unmapped = useMemo(() => (data ? entries.filter((e) => !data.tree.tipOf.has(e.code)) : []), [data, entries])
  const oldest = useMemo(() => (data ? oldestLineage(data.tree, onList) : undefined), [data, onList])

  // Focus follows the level: drilling in focuses the breadcrumb's current step, a step back the row it came from.
  const box = useRef<HTMLDivElement>(null)
  const focus = useRef<string | null>(null)
  useEffect(() => {
    const f = focus.current
    if (!f) return
    focus.current = null
    // A genus opened from a row's list goes back to that list's button.
    box.current?.querySelector<HTMLElement>(f === 'here' ? '.eb-tree-here' : `[data-key="${f}"], [data-inside~="${f}"]`)?.focus()
  }, [level])
  const go = (next: TreeLevel, back?: string) => {
    focus.current = back ?? 'here'
    setList(null)
    setLevel(next)
  }

  if (failed) return <p className="eb-tree-note">{tt.failed}</p>
  if (!data || !view || !species) return <p className="eb-mono eb-tree-note">{tt.loading}</p>

  // The level drawn: a folded family or genus opens the row whose branch holds it.
  const at = view.level
  const famRow = at.fam ? species.rows.find((r) => r.fam === at.fam) : undefined
  const famLabel = (r: SpeciesRow) => (sci ? r.fam : familyName(r))
  const crumbs: { label: string; latin: boolean; to?: TreeLevel; back?: string }[] = [{ label: tt.all, latin: false, to: {}, back: at.fam }]
  if (famRow) crumbs.push({ label: famLabel(famRow), latin: sci, to: { fam: at.fam }, back: at.genus })
  if (at.genus) crumbs.push({ label: at.genus, latin: true })
  const here = at.genus ?? (famRow ? famLabel(famRow) : undefined)
  const count = (n: number) => formatInt(n, t.num)
  // A family's or genus's name as shown, and whether it is Latin.
  const groupName = (r: SpeciesRow, fam: boolean): [string, boolean] => (fam ? [famLabel(r), sci] : [genusOf(r.sci), true])
  const insideNote = (() => {
    if (!view.inside || !here) return undefined
    if (at.genus && view.inside.length > 2) return plural(tt.insideMany, view.inside.length, { n: count(view.inside.length), name: here })
    const names = view.inside.map((r) => groupName(r, !at.genus)[0])
    const last = names.pop()!
    return names.length ? fmt(tt.insideTwo, { a: names.join(', '), b: last, name: here }) : fmt(tt.insideOne, { a: last, name: here })
  })()
  const ticks = ageTicks(view.drawing.rootAge).filter((v) => v / view.drawing.rootAge <= 0.97 || v === 0)

  // "with Turacoena", "with Urolestes and Corvinella": the groups folded into a row's branch, named as the row's own.
  const withText = (rows: Inside[], fam: boolean) => {
    const names = rows.map((w) => groupName(w.row, fam)[0])
    const tag = (chunk: string) => <span lang={!fam || sci ? 'la' : undefined}>{chunk}</span>
    const b = names.pop()!
    return rich(names.length ? fmt(tt.withTwo, { a: names.join(', '), b }) : fmt(tt.withOne, { a: b }), { a: tag, b: tag })
  }
  const groupRow = (r: Extract<TreeRow, { kind: 'group' }>) => {
    const fam = !at.fam
    const primary = fam ? famLabel(r.row) : r.key
    // Level one: the family's other name. Level two inside a folded family: a genus of another family names its family.
    const other = fam ? (sci ? familyName(r.row) : r.row.fam) : r.row.fam !== at.fam ? famLabel(r.row) : undefined
    const otherLatin = fam ? !sci : sci
    const marked = !!r.with
    // More than two genera inside: a count opening their list instead of the sentence.
    const many = !fam && r.with && r.with.length > 2 ? r.with : undefined
    return (
      <>
      <button
        type="button"
        className="eb-tree-btn"
        data-key={r.key}
        data-on={r.on > 0 || undefined}
        onClick={() => go(fam ? { fam: r.key } : { fam: at.fam, genus: r.key })}
      >
        <span className="eb-tree-dot" aria-hidden="true" />
        <span className="eb-tree-name">
          <span lang={!fam || sci ? 'la' : undefined}>{primary}</span>
          {marked && <span className="eb-tree-mark" aria-hidden="true" />}
          {r.with && !many && <>{' '}<span className="eb-tree-other" data-keep>{withText(r.with, fam)}</span></>}
          {other && <>{' '}<span className="eb-tree-other" data-keep={!fam || undefined} lang={otherLatin ? 'la' : undefined}>{other}</span></>}
        </span>
        <span className="eb-mono eb-tree-count" aria-hidden="true">{count(r.on)} / {count(r.total)}</span>
        <span className="eb-sr">{marked && `, ${tt.markSr}`}, {fmt(tt.onList, { n: count(r.on), total: count(r.total) })}{r.dotted && `, ${tt.dottedSr}`}</span>
      </button>
      {many && (
        <button type="button" className="eb-tree-with" aria-haspopup="dialog" aria-expanded={list === r.key} data-inside={many.map((w) => w.key).join(' ')} onClick={() => setList(r.key)}>
          <span className="eb-sr" lang="la">{r.key}</span>{' '}{plural(tt.withMany, many.length, { n: count(many.length) })}
        </button>
      )}
      </>
    )
  }
  const speciesRow = (r: Extract<TreeRow, { kind: 'species' }>) => {
    const name = sci ? r.row.sci : displayName(r.row)
    const inner = (
      <>
        <span className="eb-tree-dot" aria-hidden="true" />
        <span className="eb-tree-name">
          <span lang={sci ? 'la' : undefined}>{name}</span>
          {/* In a folded genus's branch, a species of another genus names its genus (its scientific name already does). */}
          {!sci && genusOf(r.row.sci) !== at.genus && <>{' '}<span className="eb-tree-other" data-keep lang="la">{genusOf(r.row.sci)}</span></>}
        </span>
        <span className="eb-sr">, {r.on ? tt.onListOne : tt.notOnList}{r.dotted && `, ${tt.dottedSr}`}</span>
      </>
    )
    return r.on
      ? <button type="button" className="eb-tree-btn" data-on data-code={r.row.code} onClick={(e) => onPick(r.row.code, e.currentTarget)}>{inner}</button>
      : <span className="eb-tree-btn">{inner}</span>
  }

  const listRow = list ? view.rows.find((r): r is Extract<TreeRow, { kind: 'group' }> => r.kind === 'group' && r.key === list && !!r.with) : undefined

  return (
    <div ref={box} className="eb-tree">
      {oldest && (
        <p className="eb-tree-fact">
          {fmt(tt.oldest, { name: displayName(species.byCode.get(oldest.code)!), age: formatAge(oldest.age, t.num) })}
        </p>
      )}
      <nav aria-label={tt.nav}>
        <p className="eb-path eb-tree-path">
          {crumbs.map((c, i) => (
            <span key={i} className="eb-path-item">
              {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
              {i === crumbs.length - 1
                ? <span className="eb-tree-here" aria-current="location" tabIndex={-1} lang={c.latin ? 'la' : undefined}>{c.label}</span>
                : <button type="button" lang={c.latin ? 'la' : undefined} onClick={() => go(c.to!, c.back)}>{c.label}</button>}
            </span>
          ))}
        </p>
      </nav>
      {view.split && here && <p className="eb-tree-note">{fmt(tt.split, { name: here })}</p>}
      {insideNote && <p className="eb-tree-note">{insideNote}</p>}
      <div className="eb-tree-chart">
        <div className="eb-tree-head" aria-hidden="true">
          <div className="eb-tree-axis">
            {ticks.map((v) => (
              <span key={v} className="eb-mono eb-tree-tick" style={{ left: `${(1 - v / view.drawing.rootAge) * 100}%` }}>{formatAge(v, t.num)}</span>
            ))}
          </div>
          <span className="eb-mono eb-tree-axis-title">{tt.axis}</span>
        </div>
        <div className="eb-tree-body" style={{ height: view.height }}>
          <svg className="eb-tree-svg" viewBox={`0 0 1000 ${view.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="eb-tree-off" d={view.drawing.unseen} vectorEffect="non-scaling-stroke" />
            <path className="eb-tree-on" d={view.drawing.seen} vectorEffect="non-scaling-stroke" />
            <path className="eb-tree-off eb-tree-dash" d={view.drawing.unseenDot} vectorEffect="non-scaling-stroke" />
            <path className="eb-tree-on eb-tree-dash" d={view.drawing.seenDot} vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="eb-tree-rows" aria-label={tt.tips}>
            {view.rows.map((r) => (
              r.kind === 'order'
                ? <li key={`o:${r.ord}:${r.top}`} className="eb-mono eb-tree-order" lang={sci ? 'la' : undefined}>{sci ? r.ord : (t.orders as Record<string, string>)[r.ord] ?? r.ord}</li>
                : <li key={`${r.kind === 'group' ? r.key : r.row.code}:${r.top}`} className="eb-tree-row">{r.kind === 'group' ? groupRow(r) : speciesRow(r)}</li>
            ))}
          </ol>
        </div>
      </div>
      {listRow && (
        <PickerSheet title={fmt(tt.insideTitle, { name: listRow.key })} count={listRow.with!.length} onClose={() => setList(null)}>
          <ul className="eb-tree-inside">
            {listRow.with!.map((w) => (
              <li key={w.key}>
                <button type="button" className="eb-tree-btn" data-on={w.on > 0 || undefined} onClick={() => go({ fam: at.fam, genus: w.key })}>
                  <span className="eb-tree-dot" aria-hidden="true" />
                  <span className="eb-tree-name"><span lang="la">{w.key}</span></span>
                  <span className="eb-mono eb-tree-count" aria-hidden="true">{count(w.on)} / {count(w.total)}</span>
                  <span className="eb-sr">, {fmt(tt.onList, { n: count(w.on), total: count(w.total) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </PickerSheet>
      )}
      <ul className="eb-tree-key">
        <li><span className="eb-tree-mark" aria-hidden="true" />{tt.keyMark}</li>
        <li>
          <svg className="eb-tree-key-line" viewBox="0 0 24 4" aria-hidden="true" focusable="false"><path className="eb-tree-on eb-tree-dash" d="M0 2H24" /></svg>
          {tt.keyDotted}
        </li>
      </ul>
      <div className="eb-tree-unmapped">
        {unmapped.length ? (
          <>
            <p>{plural(tt.unmapped, unmapped.length, { n: count(unmapped.length) })}</p>
            <ul>
              {unmapped.map((e) => {
                const r = species.byCode.get(e.code)!
                return (
                  <li key={e.code}>
                    <button type="button" className="eb-tree-link" data-code={e.code} lang={sci ? 'la' : undefined} onClick={(ev) => onPick(e.code, ev.currentTarget)}>{sci ? r.sci : displayName(r)}</button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : <p>{tt.allMapped}</p>}
      </div>
      <p className="eb-tree-credit">
        {rich(fmt(tt.credit, { tree: data.file.tree, taxonomy: data.file.taxonomy, year: data.file.ebirdTaxonomy }), {
          src: (chunk) => <a href={AVES_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
          lic: (chunk) => <a href={CC_BY_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
        })}
      </p>
    </div>
  )
}
