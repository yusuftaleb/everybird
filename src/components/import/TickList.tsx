'use client'
// Tick by hand, page-wide: the whole eBird taxonomy (~11,000 species) as a browsable, searchable list in which the
// birder ticks many birds at once, then adds them with one optional date and place. The list is windowed (only the
// rows in view are in the DOM), so it stays fast at any size. It is a multi-select listbox: focus stays on the list,
// the arrow keys move the active row, Space ticks it; a click ticks a row. Birds already on the list show ticked;
// un-ticking one marks it to come off the list ("Remove N from my list"), as the bird card's Remove does, with the same
// "Removed … · Undo" toast for a few seconds.
import { Check } from '@phosphor-icons/react'
import { useCallback, useDeferredValue, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { removedText, UndoToast, type Removal } from '@/components/app/UndoToast'
import { Sticker } from '@/components/collage/Sticker'
import { track } from '@/lib/analytics'
import { stripBracket } from '@/lib/import/places'
import type { Edits, Place } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import { addTicked, filterTickRows, removeTicked, undoRemove } from '@/lib/list/tick'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import type { Regions } from '@/lib/species/types'
import { parseManualDate } from './manual-date'

type Props = {
  species: SpeciesIndex
  regions: Regions
  edits: Edits
  dispatch: (a: Action) => void
  /** Codes already on the list (shown ticked; un-ticking one marks it for removal). */
  onList: ReadonlySet<string>
  /** No records from any source and nothing added by hand yet: this batch starts a hand-made collage. */
  listEmpty?: boolean
}

const ROW = 56
const VIEW = 8 // rows in view (the list's height)
const OVER = 6 // rows drawn above and below the view

export function TickList({ species, regions, edits, dispatch, onList, listEmpty }: Props) {
  const ids = useId()
  const [q, setQ] = useState('')
  const [order, setOrder] = useState('')
  const [family, setFamily] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  // Birds on the list the birder un-ticked, to take off with "Remove N from my list".
  const [dropped, setDropped] = useState<Set<string>>(() => new Set())
  const [active, setActive] = useState(0)
  const [top, setTop] = useState(0)
  const [date, setDate] = useState('')
  const [dateError, setDateError] = useState(false)
  const [country, setCountry] = useState('')
  const [sub1, setSub1] = useState('')
  const [done, setDone] = useState('')
  const [removed, setRemoved] = useState<(Removal & { before: Edits }) | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const orders = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of species.rows) if (!seen.has(r.ord) || r.to < seen.get(r.ord)!) seen.set(r.ord, r.to)
    return [...seen].sort((a, b) => a[1] - b[1]).map(([o]) => o)
  }, [species])
  const families = useMemo(() => {
    if (!order) return []
    const seen = new Map<string, { com: string; to: number }>()
    for (const r of species.rows) if (r.ord === order && (!seen.has(r.fam) || r.to < seen.get(r.fam)!.to)) seen.set(r.fam, { com: r.famCom || r.fam, to: r.to })
    return [...seen].sort((a, b) => a[1].to - b[1].to)
  }, [species, order])
  // The list follows the search a beat behind the keys, so typing never waits on a pass over 11,000 names.
  const dq = useDeferredValue(q)
  const rows = useMemo(() => filterTickRows(species.rows, { q: dq, order, family }), [species, dq, order, family])
  const countries = useMemo(
    () => Object.entries(regions.countries).map(([iso, name]) => [iso, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1])),
    [regions],
  )
  const subs = useMemo(
    () => (country ? Object.entries(regions.sub1).filter(([c]) => c.startsWith(`${country}-`)).map(([c, name]) => [c, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1])) : []),
    [regions, country],
  )

  // A new search or group starts at the top.
  const fromTop = () => { setActive(0); setTop(0); if (box.current) box.current.scrollTop = 0 }
  const at = Math.min(active, Math.max(0, rows.length - 1))
  const first = Math.max(0, Math.floor(top / ROW) - OVER)
  const last = Math.min(rows.length, Math.ceil((top + VIEW * ROW) / ROW) + OVER)

  const flip = (p: Set<string>, code: string) => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n }
  const toggle = (code: string) => {
    setDone('')
    if (onList.has(code)) setDropped((p) => flip(p, code))
    else setPicked((p) => flip(p, code))
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
    const page = VIEW - 1
    const go: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + page, PageUp: at - page, Home: 0, End: rows.length - 1 }
    if (e.key in go) { e.preventDefault(); moveTo(go[e.key]) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (rows[at]) toggle(rows[at].code) }
  }

  const add = () => {
    const d = parseManualDate(date)
    if (d === null) { setDateError(true); return }
    const codes = [...picked]
    if (!codes.length) return
    let place: Place | undefined
    if (country) { place = { country }; if (sub1) place.sub1 = sub1 }
    dispatch({ type: 'edit', edits: addTicked(edits, codes, { date: d || undefined, place }) })
    // Only a batch into an empty list starts a hand-made collage; later ones are edits.
    if (listEmpty) track('collage_made', { source: 'manual' })
    setDone(`Added ${codes.length.toLocaleString('en-US')} ${codes.length === 1 ? 'bird' : 'birds'} to your list.`)
    setPicked(new Set())
  }
  const drop = [...dropped].filter((c) => onList.has(c))
  const remove = () => {
    if (!drop.length) return
    dispatch({ type: 'edit', edits: removeTicked(edits, drop) })
    setDone('')
    setRemoved({ codes: drop, text: removedText(drop.map((c) => species.byCode.get(c)?.com ?? c)), before: edits })
    setDropped(new Set())
  }
  // Undo: exactly what the removal changed comes back (the removed list, hand records as they were), later edits kept.
  const undo = () => {
    if (!removed) return
    dispatch({ type: 'edit', edits: undoRemove(edits, removed.before, removed.codes) })
    setRemoved(null)
    box.current?.focus({ preventScroll: true }) // back to the list the birds came off
  }
  const dismiss = useCallback(() => setRemoved(null), [])

  const n = picked.size
  return (
    <section className="eb-tick" aria-labelledby={`${ids}-h`}>
      <h3 id={`${ids}-h`} className="eb-sr">Tick birds off a list</h3>
      <div className="eb-tick-tools">
        <label className="eb-sr" htmlFor={`${ids}-q`}>Search birds</label>
        <input
          id={`${ids}-q`}
          className="eb-input eb-tick-q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Common or scientific name"
          value={q}
          onChange={(e) => { setQ(e.target.value); fromTop() }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); box.current?.focus() } }}
        />
        <label className="eb-sr" htmlFor={`${ids}-o`}>Order</label>
        <span className="eb-select">
          <select id={`${ids}-o`} className="eb-input" value={order} onChange={(e) => { setOrder(e.target.value); setFamily(''); fromTop() }}>
            <option value="">All orders</option>
            {orders.map((o) => <option key={o} value={o}>{orderLabel(o)}</option>)}
          </select>
        </span>
        {families.length > 1 && (
          <>
            <label className="eb-sr" htmlFor={`${ids}-f`}>Family</label>
            <span className="eb-select">
              <select id={`${ids}-f`} className="eb-input" value={family} onChange={(e) => { setFamily(e.target.value); fromTop() }}>
                <option value="">All families</option>
                {families.map(([f, v]) => <option key={f} value={f}>{v.com}</option>)}
              </select>
            </span>
          </>
        )}
      </div>
      <p className="eb-mono eb-tick-count" aria-live="polite">{rows.length.toLocaleString('en-US')} species</p>

      <div
        ref={box}
        className="eb-ticklist"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Species to tick"
        aria-activedescendant={rows[at] ? `${ids}-r-${rows[at].code}` : undefined}
        tabIndex={0}
        style={{ height: Math.min(VIEW, Math.max(rows.length, 1)) * ROW }}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        onKeyDown={onKey}
        data-testid="tick-list"
      >
        <div style={{ height: rows.length * ROW, position: 'relative' }}>
          {rows.slice(first, last).map((r, k) => {
            const i = first + k
            const on = onList.has(r.code)
            const sel = on ? !dropped.has(r.code) : picked.has(r.code)
            const fit = Math.min(48 / Math.max(r.ar, 0.01), 36)
            return (
              <div
                key={r.code}
                id={`${ids}-r-${r.code}`}
                role="option"
                aria-selected={sel}
                aria-label={`${r.com}, ${r.sci}${on ? ', already on your list' : ''}`}
                data-on={on || undefined}
                className="eb-tickrow"
                data-active={i === at || undefined}
                style={{ top: i * ROW }}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setActive(i); box.current?.focus({ preventScroll: true }); toggle(r.code) }}
              >
                <span className="eb-tickbox" aria-hidden="true">{sel && <Check weight="bold" />}</span>
                <span className="eb-tickthumb" aria-hidden="true"><span style={{ width: Math.round(fit * r.ar), height: Math.round(fit) }}><Sticker code={r.code} st={r.st} ar={r.ar} w={fit * r.ar} h={fit} /></span></span>
                <span className="eb-tickname">
                  <span>{r.com}</span>
                  <i lang="la">{r.sci}</i>
                </span>
                {on && <span className="eb-mono eb-tickon">{sel ? 'On your list' : 'To remove'}</span>}
              </div>
            )
          })}
        </div>
      </div>
      {!rows.length && <p className="eb-note">No bird by that name in eBird&apos;s taxonomy.</p>}

      <div className="eb-tickbar" role="group" aria-label="Add or remove the ticked birds">
        <p className="eb-tickbar-n" aria-live="polite">
          {n.toLocaleString('en-US')} selected
          {drop.length > 0 && <span className="eb-tickbar-drop"> · {drop.length.toLocaleString('en-US')} to remove</span>}
        </p>
        <div className="eb-tickbar-fields">
          <label className="eb-sr" htmlFor={`${ids}-d`}>Date (optional)</label>
          <input
            id={`${ids}-d`}
            className="eb-input"
            inputMode="numeric"
            placeholder="Date: YYYY-MM-DD, YYYY-MM or YYYY"
            value={date}
            aria-invalid={dateError || undefined}
            aria-describedby={dateError ? `${ids}-de` : undefined}
            onChange={(e) => { setDate(e.target.value); setDateError(false) }}
          />
          <label className="eb-sr" htmlFor={`${ids}-c`}>Country (optional)</label>
          <span className="eb-select">
            <select id={`${ids}-c`} className="eb-input" value={country} onChange={(e) => { setCountry(e.target.value); setSub1('') }}>
              <option value="">No country</option>
              {countries.map(([iso, name]) => <option key={iso} value={iso}>{name}</option>)}
            </select>
          </span>
          {subs.length > 0 && (
            <>
              <label className="eb-sr" htmlFor={`${ids}-s`}>Region (optional)</label>
              <span className="eb-select">
                <select id={`${ids}-s`} className="eb-input" value={sub1} onChange={(e) => setSub1(e.target.value)}>
                  <option value="">Whole country</option>
                  {subs.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
                </select>
              </span>
            </>
          )}
          <button type="button" className="eb-btn" disabled={!n} onClick={add}>Add {n.toLocaleString('en-US')} to my list</button>
        </div>
        {dateError && <p id={`${ids}-de`} className="eb-error">Use YYYY-MM-DD, YYYY-MM or YYYY.</p>}
        {drop.length > 0 && (
          <div className="eb-row">
            <button type="button" className="eb-btn eb-btn-quiet eb-btn-danger" onClick={remove}>Remove {drop.length.toLocaleString('en-US')} from my list</button>
            <button type="button" className="eb-textbtn" onClick={() => setDropped(new Set())}>Keep them</button>
          </div>
        )}
        <p className="eb-status" role="status">{done}</p>
      </div>
      <UndoToast removal={removed} onUndo={undo} onDone={dismiss} />
    </section>
  )
}
