'use client'
// Add by hand (the Add birds dialog and Settings): the whole eBird taxonomy (~11,000 species). With the search empty it
// is one list that opens in place, as the Places list did (a disclosure list): the orders, each a compact row with a
// chevron, its common name, its scientific name after it (smaller, Muted, italic) and its species count; one group is
// open at a time at each level (opening one closes its siblings, `toggleOpen`); opening an order shows its families under it, a family its genera, a genus
// its species, with no lone levels (the Tree's rule, `taxonOpen`: an order with one family shows its genera, a family with
// one genus its species, a group of 12 species or fewer its species). Only species rows carry stickers. Typing in the search shows the matches
// instead (by word prefixes of either name), and clearing it brings the list back with the same rows open. Species rows
// (a fill only under the pointer and on the active row while their list has the keyboard's focus) are a multi-select listbox whose selected options are the birds on the list (the search's, and each open genus's): the
// arrow keys move the active row, Space or Enter flips it; a click flips a row. A tap adds a bird to the list at once and a tap on a bird already on it takes it off at
// once, each with "Added … · Undo" or "Removed … · Undo". Taking off a bird is the bird card's Remove (removeTicked): it
// goes into `removed`, so a file that has it no longer counts it. "When and where", a bar before the search and the list
// (2026-11-22: under the list it was missed until after the ticking), always there, gives every bird added next a date
// (the system picker, or a year alone) and a country and a state or province (its select always shown, off until the
// country has some), when set. A group's count is the taxonomy's, "12 / 178" once some are on the list. The search's list is windowed
// (only the rows in view are in the DOM); both lists keep one height (`view` rows, fewer where the box shrinks to fit
// the dialog).
import { Check } from '@/components/phosphor-icons'
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { removedText, UndoToast, type Removal } from '@/components/app/UndoToast'
import { Sticker } from '@/components/collage/Sticker'
import { fmt, plural } from '@/i18n/core'
import { dayText, formatInt, formatMonth } from '@/i18n/format'
import { HTML_LANG } from '@/i18n/langs'
import { useI18n } from '@/i18n/I18nProvider'
import { ChevronDownIcon, SearchIcon } from '@/components/collage/icons'
import { regionsIn } from '@/lib/i18n-places'
import { track } from '@/lib/analytics'
import { today } from '@/lib/download'
import { stripBracket } from '@/lib/import/places'
import type { Edits, Place } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import { addTicked, filterTickRows, onListByGroup, removeTicked, taxonChildren, taxonOpen, toggleOpen, undoEdit, type TaxonGroup, type TaxonPath } from '@/lib/list/tick'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName, nameOfCode } from '@/lib/species/names'
import { orderLabel } from '@/lib/species/orders'
import { useNames } from '@/lib/species/use-names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { parseManualDate } from './manual-date'

type Props = {
  species: SpeciesIndex
  regions: Regions
  edits: Edits
  dispatch: (a: Action) => void
  /** Codes on the list (shown ticked; a tap takes one off). */
  onList: ReadonlySet<string>
  /** No records from any source and nothing added by hand yet: the next bird starts a hand-made collage. */
  listEmpty?: boolean
  /** Focus the search on mount (the Add birds dialog's Add by hand; not on Settings, where it is part of the page). */
  autoFocus?: boolean
  /** Rows the list shows at most (8; the dialog's 7, so it fits a laptop's screen). */
  view?: number
}

const ROW = 56
const VIEW = 8 // rows in view at most (the list's height)
const OVER = 6 // rows drawn above and below the view

/** A species' sticker in the species rows' box (48 × 36). */
function Thumb({ r }: { r: SpeciesRow }) {
  const fit = Math.min(48 / Math.max(r.ar, 0.01), 36)
  return (
    <span className="eb-tickthumb" aria-hidden="true">
      <span style={{ width: Math.round(fit * r.ar), height: Math.round(fit) }}><Sticker code={r.code} st={r.st} ar={r.ar} sv={r.sv} w={fit * r.ar} h={fit} /></span>
    </span>
  )
}

/**
 * Species rows: a multi-select listbox, windowed (only the rows in view, and OVER around them, are in the DOM). The
 * search's is `view` rows tall and scrolls; an open genus's (`inline`) is as tall as its rows, inside the list's scroll.
 */
function TickOptions({ rows, onList, onFlip, view, inline, boxRef, label, labelledBy }: {
  rows: readonly SpeciesRow[]; onList: ReadonlySet<string>; onFlip: (code: string, box: HTMLDivElement | null) => void; view: number
  inline?: boolean; boxRef?: RefObject<HTMLDivElement | null>; label?: string; labelledBy?: string
}) {
  const ids = useId()
  const { t } = useI18n()
  const tt = t.tick
  const own = useRef<HTMLDivElement>(null)
  const box = boxRef ?? own
  const [active, setActive] = useState(0)
  const [top, setTop] = useState(0)
  // The list's drawn height: `view` rows, or fewer where its box shrinks to fit (the dialog).
  const [boxH, setBoxH] = useState(view * ROW)
  useEffect(() => {
    const el = box.current
    if (inline || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || view * ROW))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, inline, box])
  const at = Math.min(active, Math.max(0, rows.length - 1))
  const first = inline ? 0 : Math.max(0, Math.floor(top / ROW) - OVER)
  const last = inline ? rows.length : Math.min(rows.length, Math.ceil((top + boxH) / ROW) + OVER)
  const moveTo = (i: number) => {
    const j = Math.max(0, Math.min(rows.length - 1, i))
    setActive(j)
    const el = box.current
    if (!el) return
    // An open genus scrolls with the whole list: its active row is brought into the list's view.
    if (inline) { el.querySelector<HTMLElement>(`[data-row="${j}"]`)?.scrollIntoView?.({ block: 'nearest' }); return }
    if (j * ROW < el.scrollTop) el.scrollTop = j * ROW
    else if ((j + 1) * ROW > el.scrollTop + el.clientHeight) el.scrollTop = (j + 1) * ROW - el.clientHeight
  }
  const onKey = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(boxH / ROW) - 1)
    const go: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + page, PageUp: at - page, Home: 0, End: rows.length - 1 }
    if (e.key in go) { e.preventDefault(); moveTo(go[e.key]) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (rows[at]) onFlip(rows[at].code, box.current) }
  }
  return (
    <div
      ref={box}
      className={inline ? 'eb-ticklist eb-ticklist-inline' : 'eb-ticklist'}
      role="listbox"
      aria-multiselectable="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-activedescendant={rows[at] ? `${ids}-r-${rows[at].code}` : undefined}
      tabIndex={0}
      style={{ height: (inline ? rows.length : Math.min(view, Math.max(rows.length, 1))) * ROW }}
      onScroll={inline ? undefined : (e) => setTop(e.currentTarget.scrollTop)}
      onKeyDown={onKey}
      data-testid={inline ? 'tick-genus' : 'tick-list'}
    >
      <div style={{ height: rows.length * ROW, position: 'relative' }}>
        {rows.slice(first, last).map((r, k) => {
          const i = first + k
          const on = onList.has(r.code)
          const name = `${displayName(r)}, ${r.sci}`
          return (
            <div
              key={r.code}
              id={`${ids}-r-${r.code}`}
              role="option"
              aria-selected={on}
              aria-label={on ? fmt(tt.onListLabel, { name }) : name}
              className="eb-tickrow"
              data-active={i === at || undefined}
              data-row={i}
              style={{ top: i * ROW }}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => { setActive(i); box.current?.focus({ preventScroll: true }); onFlip(r.code, box.current) }}
            >
              <span className="eb-tickbox" aria-hidden="true">{on && <Check weight="bold" />}</span>
              <Thumb r={r} />
              <span className="eb-tickname">
                <span>{displayName(r)}</span>
                <i className="eb-ticksub" lang="la">{r.sci}</i>
              </span>
              {on && <span className="eb-mono eb-tickon">{tt.onList}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** What every row of the list that opens in place reads. */
type Tree = {
  species: SpeciesIndex; onList: ReadonlySet<string>; onFlip: (code: string, box: HTMLDivElement | null) => void
  open: ReadonlySet<string>; toggle: (key: string) => void
  /** How many birds on the list each group holds (onListByGroup). */
  onGroup: ReadonlyMap<string, number>
}

/**
 * One group (an order, a family or a genus) `depth` steps in: a compact disclosure row (the chevron, its names, its
 * species count) and, while open, what is under it, indented a step: its groups or its species (`taxonOpen`).
 */
function GroupNode({ path, g, depth, tree }: { path: TaxonPath; g: TaxonGroup; depth: number; tree: Tree }) {
  const id = useId()
  const { t } = useI18n()
  const at = [...path, g.id]
  const key = at.join('/')
  const isOpen = tree.open.has(key)
  // Orders by the dictionary's names, families by their names, each with its scientific name after it; genera by
  // their scientific name alone.
  const common = at.length === 1 ? orderLabel(g.id, t) : at.length === 2 ? familyName(g.first) : undefined
  const lead = common ?? g.id
  const count = formatInt(g.n, t.num)
  // The count is the taxonomy's; with birds of the group on the list, "12 / 178" (Ink, then Muted), read "12 of 178 on your list".
  const on = tree.onGroup.get(key) ?? 0
  const spoken = on ? fmt(t.tick.groupOnList, { on: formatInt(on, t.num), n: count }) : plural(t.import.species, g.n, { n: count })
  return (
    <li>
      <button
        type="button" id={`${id}-b`} className="eb-tickgroup" aria-expanded={isOpen} aria-controls={isOpen ? id : undefined}
        aria-label={`${lead}, ${spoken}`} data-testid={`tick-group-${key}`}
        style={depth ? { paddingLeft: `calc(8px + ${depth} * var(--eb-tick-indent))` } : undefined} onClick={() => tree.toggle(key)}
      >
        <span className="eb-tickchev" aria-hidden="true"><ChevronDownIcon /></span>
        <span className="eb-tickgroup-name">
          <span lang={common === undefined ? 'la' : undefined}>{lead}</span>
          {common !== undefined && <>{' '}<i className="eb-ticksub" lang="la">{g.id}</i></>}
        </span>
        <span className="eb-mono eb-langcode eb-tickgroup-n" aria-hidden="true">{on ? <><span className="eb-tickgroup-on">{formatInt(on, t.num)}</span> / {count}</> : count}</span>
      </button>
      {isOpen && <GroupBody id={id} labelledBy={`${id}-b`} path={at} n={g.n} depth={depth + 1} tree={tree} />}
    </li>
  )
}

/** Under an open group: the groups `taxonOpen` shows (an order's families, or past a lone level the genera), or its species as tickable rows. */
function GroupBody({ id, labelledBy, path, n, depth, tree }: { id: string; labelledBy: string; path: TaxonPath; n: number; depth: number; tree: Tree }) {
  const { species } = tree
  const key = path.join('/') // the path is a new array each render; what it shows is worked out once per group
  const shown = useMemo(() => taxonOpen(species.rows, key.split('/'), n), [species, key, n])
  const rows = useMemo(() => (shown.groups.length ? [] : filterTickRows(species.rows, { taxon: shown.path })), [species, shown])
  if (!shown.groups.length) {
    return (
      <div id={id} className="eb-ticktree-sub" style={{ paddingLeft: `calc(${depth} * var(--eb-tick-indent))` }}>
        <TickOptions rows={rows} onList={tree.onList} onFlip={tree.onFlip} view={rows.length} inline labelledBy={labelledBy} />
      </div>
    )
  }
  return (
    <ul id={id} className="eb-ticktree-sub" aria-labelledby={labelledBy}>
      {shown.groups.map((g) => <GroupNode key={g.id} path={shown.path} g={g} depth={depth} tree={tree} />)}
    </ul>
  )
}

export function TickList({ species, regions, edits, dispatch, onList, listEmpty, autoFocus, view = VIEW }: Props) {
  const ids = useId()
  const { lang, t } = useI18n()
  const tt = t.tick
  const names = useNames() // the names file arrived or the English switch flipped: the rows read their names again
  const num = (x: number) => formatInt(x, t.num)
  const [q, setQ] = useState('')
  // The groups open in the list (paths "order", "order/family", "order/family/genus"), kept while a search shows instead.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [date, setDate] = useState('')
  const [year, setYear] = useState('')
  const [country, setCountry] = useState('')
  const [sub1, setSub1] = useState('')
  const [change, setChange] = useState<(Removal & { before: Edits }) | null>(null)
  const box = useRef<HTMLDivElement>(null) // the search's listbox
  const treeBox = useRef<HTMLDivElement>(null) // the list that opens in place
  const last = useRef<HTMLDivElement | null>(null) // the listbox a bird was last ticked in: Undo gives it the focus back
  const search = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  // In the dialog the search has the focus as soon as this opens (an effect: after the dialog's own focus, a layout effect).
  useEffect(() => { if (autoFocus) search.current?.focus({ preventScroll: true }) }, [autoFocus])

  // The search follows the keys a beat behind, so typing never waits on a pass over 11,000 names.
  const dq = useDeferredValue(q)
  const searching = dq.trim() !== ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  const rows = useMemo(() => (searching ? filterTickRows(species.rows, { q: dq }) : []), [species, dq, searching, names])
  const orders = useMemo(() => taxonChildren(species.rows, []), [species])
  // Country names in the UI language (Intl.DisplayNames, src/lib/i18n-places.ts), sorted in its order.
  const countries = useMemo(
    () => Object.entries(regionsIn(regions, lang).countries).map(([iso, name]) => [iso, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1], HTML_LANG[lang])),
    [regions, lang],
  )
  const subs = useMemo(
    () => (country ? Object.entries(regions.sub1).filter(([c]) => c.startsWith(`${country}-`)).map(([c, name]) => [c, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1], HTML_LANG[lang])) : []),
    [regions, country, lang],
  )
  // A year alone, checked as typed dates always were (manual-date.ts: from 1800, not in the future).
  const yearBad = !!year && (!/^\d{4}$/.test(year.trim()) || parseManualDate(year) === null)

  const flip = (code: string, from: HTMLDivElement | null) => {
    last.current = from
    const name = nameOfCode(species.byCode, code)
    if (onList.has(code)) {
      dispatch({ type: 'edit', edits: removeTicked(edits, [code]) })
      setChange({ codes: [code], text: removedText([name], t), before: edits })
      return
    }
    if (yearBad) { yearRef.current?.focus(); return }
    let place: Place | undefined
    if (country) { place = { country }; if (sub1) place.sub1 = sub1 }
    const d = date || year.trim()
    dispatch({ type: 'edit', edits: addTicked(edits, [code], { date: d || undefined, place }) })
    // Only the first bird into an empty list starts a hand-made collage; later ones are edits.
    if (listEmpty) track('collage_made', { source: 'manual' })
    // The date and place the bar gave it, named, so a value left from earlier ticks never goes unnoticed: "Added
    // Mallard · May 2024 · France." The first bird into an empty list adds "Your collage has 1 species."
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    const when = day ? dayText(new Date(+day[1], +day[2] - 1, +day[3]), t.date.months, true) : formatMonth(d, t.date.months)
    const countryName = countries.find(([iso]) => iso === country)?.[1]
    const where = countryName && (sub1 ? `${subs.find(([c]) => c === sub1)?.[1] ?? sub1}, ${countryName}` : countryName)
    const details = [when, where].filter(Boolean).join(' · ')
    const added = details ? fmt(tt.addedAt, { name, details }) : fmt(tt.added, { name })
    setChange({ codes: [code], text: listEmpty ? `${added} ${plural(t.import.summary.head, 1, { n: num(1) })}.` : added, before: edits })
  }
  const toggle = useCallback((key: string) => setOpen((prev) => toggleOpen(prev, key)), [])
  // Undo: exactly what the change touched comes back (on or off the list, hand records as they were), later edits kept.
  const undo = () => {
    if (!change) return
    dispatch({ type: 'edit', edits: undoEdit(edits, change.before, change.codes) })
    setChange(null)
    last.current?.focus({ preventScroll: true })
  }
  const dismiss = useCallback(() => setChange(null), [])
  const onGroup = useMemo(() => onListByGroup(species.byCode, onList), [species, onList])
  const tree: Tree = { species, onList, onFlip: flip, open, toggle, onGroup }

  return (
    <section className="eb-tick" aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className="eb-sr">{tt.label}</h3>
      <div className="eb-tickbar" role="group" aria-labelledby={`${ids}-w`}>
        <p id={`${ids}-w`} className="eb-tickbar-n">{tt.when}</p>
        {/* Each field under its own visible label; an empty date input draws as a blank box on iOS, so it carries a muted hint. */}
        <div className="eb-tick-fields">
          <div className="eb-tickfield">
            <label className="eb-label" htmlFor={`${ids}-d`}>{tt.date}</label>
            <span className="eb-tickdate">
              <input
                id={`${ids}-d`}
                className="eb-input"
                type="date"
                min="1800-01-01"
                max={today()}
                value={date}
                data-empty={!date || undefined}
                onChange={(e) => { setDate(e.target.value); if (e.target.value) setYear('') }}
              />
              {!date && <span className="eb-tickdate-hint" aria-hidden="true">{tt.datePick}</span>}
            </span>
          </div>
          <div className="eb-tickfield">
            <label className="eb-label" htmlFor={`${ids}-y`}>{tt.year}</label>
            <input
              ref={yearRef}
              id={`${ids}-y`}
              className="eb-input"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={year}
              aria-invalid={yearBad || undefined}
              aria-describedby={yearBad ? `${ids}-ye` : undefined}
              onChange={(e) => { setYear(e.target.value); if (e.target.value) setDate('') }}
            />
          </div>
          <div className="eb-tickfield eb-tickfield-place">
            <label className="eb-label" htmlFor={`${ids}-c`}>{tt.country}</label>
            <span className="eb-select">
              <select id={`${ids}-c`} className="eb-input" value={country} onChange={(e) => { setCountry(e.target.value); setSub1('') }}>
                <option value="">{tt.noCountry}</option>
                {countries.map(([iso, name]) => <option key={iso} value={iso}>{name}</option>)}
              </select>
            </span>
          </div>
          {/* Always there, so a state or province is found before a country is picked; off until it has one to offer. */}
          <div className="eb-tickfield eb-tickfield-place">
            <label className="eb-label" htmlFor={`${ids}-s`}>{tt.region}</label>
            <span className="eb-select">
              <select id={`${ids}-s`} className="eb-input" value={sub1} disabled={!subs.length} onChange={(e) => setSub1(e.target.value)}>
                <option value="">{country ? tt.wholeCountry : tt.pickCountry}</option>
                {subs.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
              </select>
            </span>
          </div>
        </div>
        {yearBad && <p id={`${ids}-ye`} className="eb-error">{tt.dateError}</p>}
      </div>
      <div className="eb-tick-tools">
        <label className="eb-sr" htmlFor={`${ids}-q`}>{tt.search}</label>
        {/* The site's search field (DESIGN.md "Fields"): the lens, as the bird search and Places' "Find a country". */}
        <span className="eb-input-wrap eb-tick-q">
          <SearchIcon className="eb-input-icon" />
          <input
            ref={search}
            id={`${ids}-q`}
            className="eb-input eb-input-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={t.import.search.placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown') return
              e.preventDefault()
              if (searching) box.current?.focus()
              else treeBox.current?.querySelector<HTMLElement>('.eb-tickgroup')?.focus()
            }}
          />
        </span>
      </div>
      <p className="eb-mono eb-tick-count" aria-live="polite">{plural(t.import.species, searching ? rows.length : species.rows.length, { n: num(searching ? rows.length : species.rows.length) })}</p>

      {searching ? (
        <>
          {/* A new search starts at the top (key): its active row and scroll. No match: the note alone (no empty box). */}
          {rows.length
            ? <TickOptions key={dq} rows={rows} onList={onList} onFlip={flip} view={view} boxRef={box} label={tt.list} />
            : <p className="eb-note">{t.import.search.none}</p>}
        </>
      ) : (
        <div ref={treeBox} className="eb-ticklist eb-ticktree" style={{ height: view * ROW }} data-testid="tick-tree">
          <ul aria-label={tt.list}>
            {orders.map((g) => <GroupNode key={g.id} path={[]} g={g} depth={0} tree={tree} />)}
          </ul>
        </div>
      )}

      {/* Each change is announced (the toast's slot is a live region); it keeps focus on the list, to tick on. */}
      <UndoToast removal={change} onUndo={undo} onDone={dismiss} focus={false} />
    </section>
  )
}
