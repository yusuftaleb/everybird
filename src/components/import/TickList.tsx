'use client'
// Add by hand (the Add birds dialog and Settings): the whole eBird taxonomy (~11,000 species) as a searchable list,
// browsable by family, where a tap adds a bird to the list at once and a tap on a bird already on it takes it off at
// once, each with "Added … · Undo" or "Removed … · Undo". Taking off a bird is the bird card's Remove (removeTicked): it
// goes into `removed`, so a file that has it no longer counts it. "When and where", a bar under the list that is always
// there and sticks to the bottom of the screen while the list is in view (as the old "Add N" bar did), gives every bird
// added a date (the system picker, or a year alone) and a country and region, when set. The list is windowed (only the
// rows in view are in the DOM) and may be shorter than `view` rows when its box is (the dialog fits the screen). It is
// a multi-select listbox whose selected options are the birds on the list: the arrow keys move the active row, Space or
// Enter flips it; a click flips a row.
import { Check } from '@phosphor-icons/react'
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { removedText, UndoToast, type Removal } from '@/components/app/UndoToast'
import { Sticker } from '@/components/collage/Sticker'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { HTML_LANG } from '@/i18n/langs'
import { useI18n } from '@/i18n/I18nProvider'
import { regionsIn } from '@/lib/i18n-places'
import { track } from '@/lib/analytics'
import { today } from '@/lib/download'
import { stripBracket } from '@/lib/import/places'
import type { Edits, Place } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import { addTicked, filterTickRows, removeTicked, undoEdit } from '@/lib/list/tick'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName, nameOfCode } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { Regions } from '@/lib/species/types'
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

export function TickList({ species, regions, edits, dispatch, onList, listEmpty, autoFocus, view = VIEW }: Props) {
  const ids = useId()
  const { lang, t } = useI18n()
  const tt = t.tick
  const names = useNames() // the names file arrived or the English switch flipped
  const num = (x: number) => formatInt(x, t.num)
  const [q, setQ] = useState('')
  const [family, setFamily] = useState('')
  const [active, setActive] = useState(0)
  const [top, setTop] = useState(0)
  // The list's drawn height: `view` rows, or fewer where its box shrinks to fit (the dialog).
  const [boxH, setBoxH] = useState(view * ROW)
  const [date, setDate] = useState('')
  const [year, setYear] = useState('')
  const [country, setCountry] = useState('')
  const [sub1, setSub1] = useState('')
  const [change, setChange] = useState<(Removal & { before: Edits }) | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)
  // In the dialog the search has the focus as soon as this opens (an effect: after the dialog's own focus, a layout effect).
  useEffect(() => { if (autoFocus) search.current?.focus({ preventScroll: true }) }, [autoFocus])
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight || view * ROW))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

  // Every family by its common name, in the UI language's order.
  const families = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of species.rows) if (!seen.has(r.fam)) seen.set(r.fam, familyName(r))
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], HTML_LANG[lang]))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [species, lang, names])
  // The list follows the search a beat behind the keys, so typing never waits on a pass over 11,000 names.
  const dq = useDeferredValue(q)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  const rows = useMemo(() => filterTickRows(species.rows, { q: dq, family }), [species, dq, family, names])
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

  // A new search or family starts at the top.
  const fromTop = () => { setActive(0); setTop(0); if (box.current) box.current.scrollTop = 0 }
  const at = Math.min(active, Math.max(0, rows.length - 1))
  const first = Math.max(0, Math.floor(top / ROW) - OVER)
  const last = Math.min(rows.length, Math.ceil((top + boxH) / ROW) + OVER)

  const flip = (code: string) => {
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
    setChange({ codes: [code], text: fmt(tt.added, { name }), before: edits })
  }
  const moveTo = (i: number) => {
    const j = Math.max(0, Math.min(rows.length - 1, i))
    setActive(j)
    const el = box.current
    if (!el) return
    if (j * ROW < el.scrollTop) el.scrollTop = j * ROW
    else if ((j + 1) * ROW > el.scrollTop + el.clientHeight) el.scrollTop = (j + 1) * ROW - el.clientHeight
  }
  const onKey = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(boxH / ROW) - 1)
    const go: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + page, PageUp: at - page, Home: 0, End: rows.length - 1 }
    if (e.key in go) { e.preventDefault(); moveTo(go[e.key]) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (rows[at]) flip(rows[at].code) }
  }
  // Undo: exactly what the change touched comes back (on or off the list, hand records as they were), later edits kept.
  const undo = () => {
    if (!change) return
    dispatch({ type: 'edit', edits: undoEdit(edits, change.before, change.codes) })
    setChange(null)
    box.current?.focus({ preventScroll: true })
  }
  const dismiss = useCallback(() => setChange(null), [])

  return (
    <section className="eb-tick" aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className="eb-sr">{tt.label}</h3>
      <div className="eb-tick-tools">
        <label className="eb-sr" htmlFor={`${ids}-q`}>{tt.search}</label>
        <input
          ref={search}
          id={`${ids}-q`}
          className="eb-input eb-tick-q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t.import.search.placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); fromTop() }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); box.current?.focus() } }}
        />
        <label className="eb-sr" htmlFor={`${ids}-f`}>{tt.family}</label>
        <span className="eb-select">
          <select id={`${ids}-f`} className="eb-input" value={family} onChange={(e) => { setFamily(e.target.value); fromTop() }}>
            <option value="">{tt.allFamilies}</option>
            {families.map(([f, com]) => <option key={f} value={f}>{com}</option>)}
          </select>
        </span>
      </div>
      <p className="eb-mono eb-tick-count" aria-live="polite">{plural(t.import.species, rows.length, { n: num(rows.length) })}</p>

      <div
        ref={box}
        className="eb-ticklist"
        role="listbox"
        aria-multiselectable="true"
        aria-label={tt.list}
        aria-activedescendant={rows[at] ? `${ids}-r-${rows[at].code}` : undefined}
        tabIndex={0}
        style={{ height: Math.min(view, Math.max(rows.length, 1)) * ROW }}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        onKeyDown={onKey}
        data-testid="tick-list"
      >
        <div style={{ height: rows.length * ROW, position: 'relative' }}>
          {rows.slice(first, last).map((r, k) => {
            const i = first + k
            const on = onList.has(r.code)
            const fit = Math.min(48 / Math.max(r.ar, 0.01), 36)
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
                style={{ top: i * ROW }}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setActive(i); box.current?.focus({ preventScroll: true }); flip(r.code) }}
              >
                <span className="eb-tickbox" aria-hidden="true">{on && <Check weight="bold" />}</span>
                <span className="eb-tickthumb" aria-hidden="true"><span style={{ width: Math.round(fit * r.ar), height: Math.round(fit) }}><Sticker code={r.code} st={r.st} ar={r.ar} sv={r.sv} w={fit * r.ar} h={fit} /></span></span>
                <span className="eb-tickname">
                  <span>{displayName(r)}</span>
                  <i lang="la">{r.sci}</i>
                </span>
                {on && <span className="eb-mono eb-tickon">{tt.onList}</span>}
              </div>
            )
          })}
        </div>
      </div>
      {!rows.length && <p className="eb-note">{t.import.search.none}</p>}

      <div className="eb-tickbar" role="group" aria-labelledby={`${ids}-w`}>
        <p id={`${ids}-w`} className="eb-tickbar-n">{tt.when}</p>
        <div className="eb-tick-fields">
          <label className="eb-sr" htmlFor={`${ids}-d`}>{tt.date}</label>
          <input
            id={`${ids}-d`}
            className="eb-input"
            type="date"
            min="1800-01-01"
            max={today()}
            value={date}
            onChange={(e) => { setDate(e.target.value); if (e.target.value) setYear('') }}
          />
          <label className="eb-sr" htmlFor={`${ids}-y`}>{tt.year}</label>
          <input
            ref={yearRef}
            id={`${ids}-y`}
            className="eb-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder={tt.year}
            value={year}
            aria-invalid={yearBad || undefined}
            aria-describedby={yearBad ? `${ids}-ye` : undefined}
            onChange={(e) => { setYear(e.target.value); if (e.target.value) setDate('') }}
          />
          <label className="eb-sr" htmlFor={`${ids}-c`}>{tt.country}</label>
          <span className="eb-select">
            <select id={`${ids}-c`} className="eb-input" value={country} onChange={(e) => { setCountry(e.target.value); setSub1('') }}>
              <option value="">{tt.noCountry}</option>
              {countries.map(([iso, name]) => <option key={iso} value={iso}>{name}</option>)}
            </select>
          </span>
          {subs.length > 0 && (
            <>
              <label className="eb-sr" htmlFor={`${ids}-s`}>{tt.region}</label>
              <span className="eb-select">
                <select id={`${ids}-s`} className="eb-input" value={sub1} onChange={(e) => setSub1(e.target.value)}>
                  <option value="">{tt.wholeCountry}</option>
                  {subs.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
                </select>
              </span>
            </>
          )}
        </div>
        {yearBad && <p id={`${ids}-ye`} className="eb-error">{tt.dateError}</p>}
      </div>
      {/* Each change is announced (the toast's slot is a live region); it keeps focus on the list, to tick on. */}
      <UndoToast removal={change} onUndo={undo} onDone={dismiss} focus={false} />
    </section>
  )
}
