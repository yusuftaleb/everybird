'use client'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, ShareNetwork, X } from '@phosphor-icons/react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { pasteRow, rowName, type CompareRow } from '@/lib/share/compare'
import { takeHandOff } from '@/lib/share/compare-handoff'
import { COMPARE_MAX, decodeCompare, decodeShare, encodeShare, NAME_MAX, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import type { Regions } from '@/lib/species/types'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import Link from '@/components/app/IntentLink'
import type { CompareShare } from '@/components/share/dialog-options'
import { CompareResult, ListDot, useComparison } from './CompareView'
import './compare.css'

const ShareDialog = lazy(() => import('@/components/share/ShareDialog'))
const NO_REGIONS: Regions = { v: 1, countries: {}, sub1: {} }

/** The set-up as left: the friends' rows, the name given to the birder's own list, whether the comparison shows. */
type Kept = { rows: CompareRow[]; mine?: string; open: boolean; next: number }
const fresh = (): Kept => ({ rows: [{ id: 0, text: '', list: null }], open: false, next: 1 })
// The set-up outlives the page while the tab stays in the app (memory only, never storage): a visitor sent to add their
// own birds first finds their friend's list waiting when they come back.
let kept: Kept = fresh()
/** Test hook: forget the set-up, as a new tab would. */
export function forgetCompare(): void {
  kept = fresh()
}
const newId = () => kept.next++

/**
 * /compare. First the set-up, on the page itself (no box): the title, a line ("Paste your friends' Everybird links. Up to 6 lists."), a
 * row per list (its colour dot, a name box, the link box, a remove button), the birder's own list first when there is
 * one (its name editable, "Your list · 1,092 species" for a link, no remove), "Add a friend" (a row, up to COMPARE_MAX
 * lists in all) and Compare at the bottom right, waiting for two lists. A link fills its row's name with the name or
 * title it carries ("Birder 2" until one is typed, without); several links, or a comparison link (/c/), pasted at once
 * fill a row each (pasteRow), within the cap, with a note for the links that didn't open and the lists past it. The
 * names typed are the comparison's, its images' and its link's. Compare shows the comparison (CompareResult): the
 * lists as pills, Edit lists (back to these rows) and Share, which opens the site's Share dialog on the comparison
 * (CompareShare: the card or the wish list, Copy link with the comparison link). "Compare with mine" on a shared
 * collage or comparison hands its link over in sessionStorage (compare-handoff.ts), read once on arrival, and opens
 * the comparison with the birder's own list. Nothing goes in the URL (the beacon reports the address) or anywhere else.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, dispatch, data, mineSoon } = useEverybirdContext()
  const id = useId()
  const [rows, setRowsState] = useState<CompareRow[]>(kept.rows)
  // The name typed for the birder's own list (unset: the collage's title).
  const [mine, setMineState] = useState<string | undefined>(kept.mine)
  const [open, setOpenState] = useState(kept.open)
  const [notes, setNotes] = useState<{ bad: number; over: number } | null>(null)
  const [sharing, setSharing] = useState(false)
  const setRows = (r: CompareRow[]) => { kept = { ...kept, rows: r }; setRowsState(r) }
  const setMine = (v: string) => { kept = { ...kept, mine: v }; setMineState(v) }
  const setOpen = (v: boolean) => { kept = { ...kept, open: v }; setOpenState(v) }

  // The birder's own list: its row shows as soon as storage says there is one; it joins once its data is in.
  const you = !!data && state.list.length > 0
  const own = you || mineSoon === true
  const room = COMPARE_MAX - (own ? 1 : 0)
  const codec = useMemo(() => ({
    decode: decodeShare, decodeC: decodeCompare, id: newId,
    link: (p: SharePayload) => { try { return `${window.location.origin}/s/${encodeShare(p).token}` } catch { return '' } },
  }), [])

  useEffect(() => {
    const link = takeHandOff()
    if (!link) return
    // "Compare with mine": the link's lists, after the birder's own, replace the rows, and the comparison opens.
    const r = pasteRow([{ id: newId(), text: '', list: null }], 0, link, COMPARE_MAX - 1, codec)
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage, read once on arrival, isn't there to prerender */
    setRows(r.rows)
    setNotes(r.bad || r.over ? r : null)
    setOpen(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [codec])

  const saved = state.saved.name?.trim()
  const mineName = (mine ?? saved ?? '').trim()
  const friends = rows.filter((r) => r.list)
  // The lists compared, as shared: each with its name as a verbatim title (link.ts F_TITLE), none without one.
  const lists = useMemo(() => {
    const named = (p: SharePayload, name: string): SharePayload => {
      const out: SharePayload = { ...p }
      delete out.name
      delete out.titled
      if (name) { out.name = name; out.titled = true }
      return out
    }
    const theirs = friends.map((r) => named(r.list!, rowName(r).trim()))
    return you && data ? [named(payloadFromList(state.list, data.regions), mineName), ...theirs] : theirs
    // friends is rows'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, you, data, state.list, mineName])
  const c = useComparison(lists, { you })
  const shown = open && c.ready
  const link = useMemo(() => (lists.length >= 2 ? makeCompareLink(lists, window.location.origin) : null), [lists])

  // Focus follows the switch between the set-up and the comparison: Edit lists, or the set-up's title.
  const editRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    ;(shown ? editRef : titleRef).current?.focus()
  }, [shown])
  const go = (v: boolean) => { moved.current = true; setOpen(v) }
  // After a remove, Add a friend (enabled again if the rows were full).
  const toAdd = useRef(false)
  useEffect(() => {
    if (!toAdd.current) return
    toAdd.current = false
    addRef.current?.focus()
  }, [rows])

  /** Row `i`'s place in the comparison once it holds a list ("Birder N", its colour): after yours and the filled rows before it. */
  const place = (i: number) => (own ? 1 : 0) + rows.slice(0, i).filter((r) => r.list).length + 1
  const setText = (i: number, text: string) => {
    const r = pasteRow(rows, i, text, room, codec)
    setRows(r.rows)
    setNotes(r.bad || r.over ? r : null)
  }
  const setName = (i: number, name: string) => setRows(rows.map((r, j) => (j === i ? { ...r, name } : r)))
  const remove = (i: number) => {
    // The last row is emptied rather than removed, so there is always one to paste into.
    setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ id: newId(), text: '', list: null }])
    setNotes(null)
    toAdd.current = true
  }
  const add = () => setRows([...rows, { id: newId(), text: '', list: null }])
  const full = (own ? 1 : 0) + rows.length >= COMPARE_MAX
  // No list of the birder's own yet: the friend's list waits for it.
  const waiting = !own && mineSoon === false && friends.length > 0 && lists.length < 2
  const blocked = link && 'blocked' in link ? (link.blocked === 'tooMany' ? fmt(t.compare.tooMany, { n: COMPARE_MAX }) : t.compare.tooBig) : ''
  const share: CompareShare | null = link
    ? { draw: c.draw, key: c.drawKey, wishOff: c.wishReason || undefined, link: 'url' in link ? link : { blocked }, alt: { comparison: c.alt, wish: c.wishAlt } }
    : null

  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      {shown ? (
        <>
          <h1 className="eb-sr">{t.compare.title}</h1>
          <CompareResult
            c={c}
            edit={<button ref={editRef} type="button" className="eb-btn eb-btn-quiet eb-compare-edit" onClick={() => go(false)} data-testid="compare-edit">{t.compare.editLists}</button>}
            share={(
              <button type="button" className="eb-btn eb-compare-share" disabled={!c.data || !share} onClick={() => setSharing(true)} data-testid="compare-share">
                <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
                {t.collage.share}
              </button>
            )}
          />
          {sharing && share && c.data && (
            <Suspense fallback={null}>
              <ShareDialog state={state} dispatch={dispatch} species={c.data.species} regions={data?.regions ?? NO_REGIONS} compare={share} onClose={() => setSharing(false)} />
            </Suspense>
          )}
        </>
      ) : (
        <form className="eb-compare-setup" onSubmit={(e) => { e.preventDefault(); if (lists.length >= 2) go(true) }} data-testid="compare-setup">
          <h1 ref={titleRef} tabIndex={-1} className="eb-pagehead-title eb-compare-title">{t.compare.title}</h1>
          <p className="eb-note" id={`${id}-note`}>{fmt(t.compare.note, { n: COMPARE_MAX })}</p>
          <ul className="eb-compare-rows" data-testid="compare-rows">
            {own && (
              <li className="eb-compare-row" data-testid="compare-row-mine">
                <ListDot i={0} />
                <input
                  className="eb-input eb-compare-namebox" type="text" autoComplete="off" maxLength={NAME_MAX} value={mine ?? saved ?? ''}
                  placeholder={fmt(t.compare.birder, { n: 1 })} aria-label={fmt(t.compare.nameN, { n: 1 })}
                  onChange={(e) => setMine(e.target.value)} data-testid="compare-name-mine"
                />
                <span className="eb-compare-mine">
                  {t.compare.yourList}
                  {you && ` · ${plural(t.count.live, state.list.length, { n: formatInt(state.list.length, t.num) })}`}
                </span>
              </li>
            )}
            {rows.map((r, i) => {
              // A filled row by its place in the comparison; one without a list yet by its own place (they agree while the
              // empty rows are last, as Add a friend puts them).
              const n = r.list ? place(i) : (own ? 1 : 0) + i + 1
              const label = rowName(r).trim() || fmt(t.compare.birder, { n })
              return (
                <li key={r.id} className="eb-compare-row" data-testid={`compare-row-${i}`}>
                  <ListDot i={n - 1} />
                  <input
                    className="eb-input eb-compare-namebox" type="text" autoComplete="off" maxLength={NAME_MAX} value={rowName(r)}
                    placeholder={fmt(t.compare.birder, { n })} aria-label={fmt(t.compare.nameN, { n })}
                    onChange={(e) => setName(i, e.target.value)} data-testid={`compare-name-${i}`}
                  />
                  <input
                    className="eb-input eb-compare-linkbox" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={r.text}
                    placeholder={t.compare.paste} aria-label={fmt(t.compare.linkN, { n })} aria-describedby={`${id}-note`}
                    onChange={(e) => setText(i, e.target.value)} data-testid={`compare-link-${i}`}
                  />
                  <button type="button" className="eb-compare-remove" aria-label={fmt(t.compare.remove, { name: label })} onClick={() => remove(i)} data-testid={`compare-remove-${i}`}>
                    <X aria-hidden="true" focusable="false" />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="eb-status" role="status" data-testid="compare-status">
            {notes && [
              notes.bad ? plural(t.compare.bad, notes.bad, { n: formatInt(notes.bad, t.num) }) : '',
              notes.over ? fmt(t.compare.over, { n: COMPARE_MAX }) : '',
            ].filter(Boolean).join(' ')}
          </p>
          {waiting && (
            <p className="eb-note eb-compare-wait-note" data-testid="compare-no-list">
              {fmt(t.compare.noList, { name: c.labels[0] ?? rowName(friends[0]) })}{' '}
              <Link href="/settings">{t.collage.addBirds}</Link>
            </p>
          )}
          <div className="eb-compare-foot">
            <button ref={addRef} type="button" className="eb-textbtn" disabled={full} aria-describedby={`${id}-note`} onClick={add} data-testid="compare-add">
              <Plus aria-hidden="true" focusable="false" />
              {t.compare.addFriend}
            </button>
            <button type="submit" className="eb-btn" disabled={lists.length < 2} aria-describedby={lists.length < 2 ? `${id}-wait` : undefined} data-testid="compare-submit">
              {t.compare.submit}
            </button>
            <span id={`${id}-wait`} hidden>{t.compare.needMore}</span>
          </div>
        </form>
      )}
    </main>
  )
}
