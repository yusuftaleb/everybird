'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). Level one is every family, grey when none of its species is on the (filtered) list; a family opens to
// its genera and a genus to its species, whose tips on the list open the bird card. The drawing is aria-hidden; the
// rows beside it carry the names and counts, top to bottom in the tree's order. Under it: the birds the tree does not
// place, and the source with its licence. levels.ts and tree.ts hold the logic.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { fetchData } from '@/lib/data-url'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { levelView, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { ageTicks, formatAge, oldestLineage, parseNewick, type Tree, type TreeFile } from '@/lib/tree/tree'
import './tree.css'

export const AVES_URL = 'https://github.com/McTavishLab/AvesData'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'

type Loaded = { file: TreeFile; tree: Tree }
let treeP: Promise<Loaded> | null = null
/** The tree, fetched and parsed once per page (a failure is not cached). */
function loadTree(): Promise<Loaded> {
  treeP ??= fetchData<TreeFile>('tree.v1.json').then((file) => ({ file, tree: parseNewick(file.newick) })).catch((e) => {
    treeP = null
    throw e
  })
  return treeP
}

type Props = {
  /** The filtered list. */
  entries: ListEntry[]
  species: SpeciesIndex
  sci: boolean
  /** Opens the bird card; `el` is the pressed button. */
  onPick: (code: string, el: HTMLElement) => void
}

export default function TreeView({ entries, species, sci, onPick }: Props) {
  const { t } = useI18n()
  useNames()
  const tt = t.collage.tree
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadTree().then((d) => { if (live) setData(d) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const [level, setLevel] = useState<TreeLevel>({})
  const onList = useMemo(() => new Set(entries.map((e) => e.code)), [entries])
  const view = useMemo(() => (data ? levelView(data.tree, species, level, onList) : undefined), [data, species, level, onList])
  const unmapped = useMemo(() => (data ? entries.filter((e) => !data.tree.tipOf.has(e.code)) : []), [data, entries])
  const oldest = useMemo(() => (data ? oldestLineage(data.tree, onList) : undefined), [data, onList])

  // Focus follows the level: drilling in focuses the breadcrumb's current step, a step back the row it came from.
  const box = useRef<HTMLDivElement>(null)
  const focus = useRef<string | null>(null)
  useEffect(() => {
    const f = focus.current
    if (!f) return
    focus.current = null
    box.current?.querySelector<HTMLElement>(f === 'here' ? '.eb-tree-here' : `[data-key="${f}"]`)?.focus()
  }, [level])
  const go = (next: TreeLevel, back?: string) => {
    focus.current = back ?? 'here'
    setLevel(next)
  }

  if (failed) return <p className="eb-tree-note">{tt.failed}</p>
  if (!data || !view) return <p className="eb-mono eb-tree-note">{tt.loading}</p>

  const famRow = level.fam ? species.rows.find((r) => r.fam === level.fam) : undefined
  const famLabel = (r: SpeciesRow) => (sci ? r.fam : familyName(r))
  const crumbs: { label: string; latin: boolean; to?: TreeLevel; back?: string }[] = [{ label: tt.all, latin: false, to: {}, back: level.fam }]
  if (famRow) crumbs.push({ label: famLabel(famRow), latin: sci, to: { fam: level.fam }, back: level.genus })
  if (level.genus) crumbs.push({ label: level.genus, latin: true })
  const here = level.genus ?? (famRow ? famLabel(famRow) : undefined)
  const ticks = ageTicks(view.drawing.rootAge).filter((v) => v / view.drawing.rootAge <= 0.97 || v === 0)
  const count = (n: number) => formatInt(n, t.num)

  const groupRow = (r: Extract<TreeRow, { kind: 'group' }>) => {
    const fam = !level.fam
    const primary = fam ? famLabel(r.row) : r.key
    const other = fam ? (sci ? familyName(r.row) : r.row.fam) : undefined
    return (
      <button
        type="button"
        className="eb-tree-btn"
        data-key={r.key}
        data-on={r.on > 0 || undefined}
        onClick={() => go(fam ? { fam: r.key } : { fam: level.fam, genus: r.key })}
      >
        <span className="eb-tree-dot" aria-hidden="true" />
        <span className="eb-tree-name">
          <span lang={!fam || sci ? 'la' : undefined}>{primary}</span>
          {other && <>{' '}<span className="eb-tree-other" lang={sci ? undefined : 'la'}>{other}</span></>}
          {r.part && <>{' '}<span className="eb-mono eb-tree-part">{fmt(tt.part, { i: r.part[0], n: r.part[1] })}</span></>}
        </span>
        <span className="eb-mono eb-tree-count" aria-hidden="true">{count(r.on)} / {count(r.total)}</span>
        <span className="eb-sr">, {fmt(tt.onList, { n: count(r.on), total: count(r.total) })}</span>
      </button>
    )
  }
  const speciesRow = (r: Extract<TreeRow, { kind: 'species' }>) => {
    const name = sci ? r.row.sci : displayName(r.row)
    const inner = (
      <>
        <span className="eb-tree-dot" aria-hidden="true" />
        <span className="eb-tree-name"><span lang={sci ? 'la' : undefined}>{name}</span></span>
        <span className="eb-sr">, {r.on ? tt.onListOne : tt.notOnList}</span>
      </>
    )
    return r.on
      ? <button type="button" className="eb-tree-btn" data-on data-code={r.row.code} onClick={(e) => onPick(r.row.code, e.currentTarget)}>{inner}</button>
      : <span className="eb-tree-btn">{inner}</span>
  }

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
