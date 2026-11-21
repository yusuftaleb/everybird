'use client'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { PencilSimple, Plus, ShareNetwork, X } from '@phosphor-icons/react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { linksIn, pasteRow, rowName, type CompareRow } from '@/lib/share/compare'
import { readCompare, writeCompare, type CompareShown } from '@/lib/share/compare-store'
import { takeHandOff } from '@/lib/share/compare-handoff'
import { COMPARE_MAX, decodeCompare, decodeShare, encodeShare, NAME_MAX, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import type { Regions } from '@/lib/species/types'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import Link from '@/components/app/IntentLink'
import { PageHead } from '@/components/app/PageHead'
import type { CompareShare } from '@/components/share/dialog-options'
import { CompareResult, ListDot, useComparison } from './CompareView'
import './compare.css'

const ShareDialog = lazy(() => import('@/components/share/ShareDialog'))
const NO_REGIONS: Regions = { v: 1, countries: {}, sub1: {} }

/** The set-up as left: the friends' rows, the name given to the birder's own list, whether the comparison shows, the chips chosen. */
type Kept = { rows: CompareRow[]; mine?: string; open: boolean; pick?: CompareShown; next: number }
const fresh = (): Kept => ({ rows: [{ id: 0, text: '', list: null }], open: false, next: 1 })
// The set-up outlives the page: in memory while the tab stays in the app, and on this device (compare-store.ts,
// localStorage, read once per page load) through a language switch, a refresh or a later visit. A visitor sent to add
// their own birds first finds their friend's list waiting when they come back.
let kept: Kept = fresh()
let read = false
/** Test hook: forget the set-up in memory, as a new page load would (what storage keeps stays). */
export function forgetCompare(): void {
  kept = fresh()
  read = false
}
const newId = () => kept.next++
const keep = (k: Kept) => {
  kept = k
  writeCompare({ rows: k.rows.map((r) => (r.name === undefined ? { text: r.text } : { text: r.text, name: r.name })), mine: k.mine, open: k.open, pick: k.pick })
}

/**
 * /compare. One page head in both states (PageHead, as My birds: "Compare life lists" and a line), so going from the
 * set-up to the comparison changes only the line and the buttons (the set-up's head has none). First the set-up, on the page's width (no box,
 * the head's line "Paste your friends' Everybird links to see which birds you share. Up to 6 lists."), a
 * row per list (its colour dot, a name box, the link box, a remove button), the birder's own list first when there is
 * one (its name editable, "Your list · 1,092 species" for a link, no remove) and "Add a birder" (a row, up to COMPARE_MAX
 * lists in all) at the foot's left, Compare at its right (its edge on the link boxes'), waiting for two lists. A link fills its row's name with the name or
 * title it carries ("Birder 2" until one is typed, without); several links, or a comparison link (/c/), pasted at once
 * fill a row each (pasteRow), within the cap, with a note for the links that didn't open and the lists past it. The
 * names typed are the comparison's, its images' and its link's. Compare shows the comparison: My birds' page head
 * ("Compare life lists", a line on how to use it, Edit lists (back to these rows) and Share, where My birds has its
 * Share), then CompareResult (the chips, the circles and bars, the chosen birds). Share opens the site's Share dialog on the comparison
 * (CompareShare: the card or the wish list, Copy link with the comparison link). "Compare with mine" on a shared
 * collage or comparison hands its link over in sessionStorage (compare-handoff.ts), read once on arrival, and opens
 * the comparison with the birder's own list, replacing what was kept. The set-up (rows, names, open, chips) is kept on
 * this device only (compare-store.ts); nothing goes in the URL (the beacon reports the address) or leaves the device.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, dispatch, data, mineSoon } = useEverybirdContext()
  const id = useId()
  const [rows, setRowsState] = useState<CompareRow[]>(kept.rows)
  // The name typed for the birder's own list (unset: the collage's title).
  const [mine, setMineState] = useState<string | undefined>(kept.mine)
  const [open, setOpenState] = useState(kept.open)
  const [pick, setPickState] = useState(kept.pick)
  // The status line after a paste: links that didn't open, lists past the cap or already in, and the lists it opened ("Sam · 412 species").
  const [notes, setNotes] = useState<{ bad: number; over: number; dup: number; opened?: string[] } | null>(null)
  // Link boxes left (blurred) or pasted into: one with text and no list is marked invalid (and every row read back from storage).
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set())
  const check = (rowId: number) => setChecked((c) => (c.has(rowId) ? c : new Set(c).add(rowId)))
  const [sharing, setSharing] = useState(false)
  const setRows = (r: CompareRow[]) => { keep({ ...kept, rows: r }); setRowsState(r) }
  const setMine = (v: string) => { keep({ ...kept, mine: v }); setMineState(v) }
  const setOpen = (v: boolean) => { keep({ ...kept, open: v }); setOpenState(v) }
  const setPick = (p: CompareShown) => { keep({ ...kept, pick: p }); setPickState(p) }

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
    /* eslint-disable react-hooks/set-state-in-effect -- storage, read once on arrival, isn't there to prerender */
    if (link) {
      // "Compare with mine": the link's lists, after the birder's own, replace the rows (and what was kept), and the comparison opens.
      const r = pasteRow([{ id: newId(), text: '', list: null }], 0, link, COMPARE_MAX - 1, codec)
      read = true
      keep({ rows: r.rows, mine: kept.mine, open: true, next: kept.next })
      setRowsState(r.rows)
      setOpenState(true)
      setPickState(undefined)
      setNotes(r.bad || r.over || r.dup ? r : null)
      setChecked(new Set(r.rows.map((x) => x.id)))
      return
    }
    if (read) return
    read = true
    // The set-up kept on this device: each row's text read again as it was pasted (one list a row, as pasteRow left it).
    const s = readCompare()
    if (!s) return
    const rows = s.rows.map((r): CompareRow => ({
      id: newId(), text: r.text, list: linksIn(r.text, decodeShare, decodeCompare).lists[0] ?? null, ...(r.name !== undefined ? { name: r.name } : {}),
    }))
    kept = { rows, mine: s.mine, open: s.open, pick: s.pick, next: kept.next }
    setRowsState(rows)
    setMineState(s.mine)
    setOpenState(s.open)
    setPickState(s.pick)
    setChecked(new Set(rows.map((x) => x.id)))
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
  const c = useComparison(lists, { you, keep: { pick, set: setPick } })
  const shown = open && c.ready
  // An open comparison coming back while the birder's own list loads (a reload, a language switch, Compare with mine):
  // the results' head over a reserved box, not the set-up for a moment.
  const pending = open && !c.ready && !you && mineSoon !== false && friends.length > 0
  // Built only once the comparison shows (each list deflated: not on every keystroke in a name box).
  const link = useMemo(() => (shown && lists.length >= 2 ? makeCompareLink(lists, window.location.origin) : null), [shown, lists])

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
  // After a remove, Add a birder (back again if the rows were full). After the add that fills the rows (the button
  // goes), the new row's name box, never the page.
  const toAdd = useRef(false)
  const toNew = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (toNew.current) {
      toNew.current = false
      formRef.current?.querySelector<HTMLInputElement>(`[data-testid="compare-name-${rows.length - 1}"]`)?.focus()
    }
    if (!toAdd.current) return
    toAdd.current = false
    addRef.current?.focus()
  }, [rows])

  /** Row `i`'s place in the comparison once it holds a list ("Birder N", its colour): after yours and the filled rows before it. */
  const place = (i: number) => (own ? 1 : 0) + rows.slice(0, i).filter((r) => r.list).length + 1
  const setText = (i: number, text: string) => {
    const r = pasteRow(rows, i, text, room, codec)
    setRows(r.rows)
    // The lists this paste opened, named as their rows will be ("Sam · 412 species"), so a link without a title shows it worked.
    const was = new Map(rows.map((x) => [x.id, x.list]))
    const opened = r.rows.flatMap((x, j) => {
      if (!x.list || was.get(x.id) === x.list) return []
      const n = (own ? 1 : 0) + r.rows.slice(0, j).filter((y) => y.list).length + 1
      const size = new Set(x.list.birds.map((b) => b.code)).size
      return [`${rowName(x).trim() || fmt(t.compare.birder, { n })} · ${plural(t.count.live, size, { n: formatInt(size, t.num) })}`]
    })
    setNotes(r.bad || r.over || r.dup || opened.length ? { ...r, opened } : null)
  }
  const setName = (i: number, name: string) => setRows(rows.map((r, j) => (j === i ? { ...r, name } : r)))
  const remove = (i: number) => {
    // The last row is emptied rather than removed, so there is always one to paste into.
    setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ id: newId(), text: '', list: null }])
    setNotes(null)
    toAdd.current = true
  }
  const full = (own ? 1 : 0) + rows.length >= COMPARE_MAX
  const add = () => {
    if ((own ? 1 : 0) + rows.length + 1 >= COMPARE_MAX) toNew.current = true
    setRows([...rows, { id: newId(), text: '', list: null }])
  }
  // No list of the birder's own yet: the friend's list waits for it.
  const waiting = !own && mineSoon === false && friends.length > 0 && lists.length < 2
  const blocked = link && 'blocked' in link ? (link.blocked === 'tooMany' ? fmt(t.compare.tooMany, { n: COMPARE_MAX }) : t.compare.tooBig) : ''
  const share: CompareShare | null = link
    ? { draw: c.draw, key: c.drawKey, wishOff: c.wishReason || undefined, link: 'url' in link ? link : { blocked }, alt: { comparison: c.alt, wish: c.wishAlt } }
    : null

  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      {/* One page head in both states: only its line and its buttons change. */}
      {pending ? (
        <>
          <PageHead key="results" title={t.compare.title} lede={t.compare.lede} />
          <div className="eb-compare-result-wait" aria-hidden="true" data-testid="compare-pending" />
        </>
      ) : shown ? (
        <>
          {/* Keyed apart from the set-up's head, so its buttons are new ones (focus goes to the title, not a reused button). */}
          <PageHead
            key="results"
            title={t.compare.title}
            lede={c.you ? t.compare.lede : t.compare.ledeTheirs}
            actions={<>
              <button ref={editRef} type="button" className="eb-btn eb-btn-quiet" aria-label={t.compare.editLists} onClick={() => go(false)} data-testid="compare-edit">
                <PencilSimple aria-hidden="true" focusable="false" />
                <span className="eb-sm-hide">{t.compare.editLists}</span>
              </button>
              <button type="button" className="eb-btn" aria-haspopup="dialog" disabled={!c.data || !share} onClick={() => setSharing(true)} data-testid="compare-share">
                <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
                {t.collage.share}
              </button>
            </>}
          />
          <CompareResult c={c} sci={state.sci} />
          {sharing && share && c.data && (
            <Suspense fallback={null}>
              <ShareDialog state={state} dispatch={dispatch} species={c.data.species} regions={data?.regions ?? NO_REGIONS} compare={share} onClose={() => setSharing(false)} />
            </Suspense>
          )}
        </>
      ) : (
        <>
          {/* The set-up's head: the title and its line only (round 6, item 11: Compare is the form's, at its foot). */}
          <PageHead
            key="setup"
            title={t.compare.title}
            lede={<span id={`${id}-note`}>{fmt(t.compare.note, { n: COMPARE_MAX })}</span>}
            titleRef={titleRef}
          />
          <form ref={formRef} id={`${id}-form`} className="eb-compare-setup" onSubmit={(e) => { e.preventDefault(); if (lists.length >= 2) go(true) }} data-testid="compare-setup">
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
                // empty rows are last, as Add a birder puts them).
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
                      className="eb-input eb-compare-linkbox" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={r.text}
                      placeholder={t.compare.paste} aria-label={fmt(t.compare.linkN, { n })} aria-describedby={`${id}-note`}
                      aria-invalid={!r.list && !!r.text.trim() && checked.has(r.id) ? true : undefined}
                      onChange={(e) => setText(i, e.target.value)} onBlur={() => check(r.id)} onPaste={() => check(r.id)} data-testid={`compare-link-${i}`}
                    />
                    {/* The one row, blank: its × would do nothing visible, so it is hidden (and out of the tab order). */}
                    <button
                      type="button" className="eb-compare-remove" aria-label={fmt(t.compare.remove, { name: label })} onClick={() => remove(i)} data-testid={`compare-remove-${i}`}
                      style={rows.length === 1 && !r.list && !r.text.trim() && !r.name?.trim() ? { visibility: 'hidden' } : undefined}
                    >
                      <X aria-hidden="true" focusable="false" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="eb-status" role="status" data-testid="compare-status">
              {notes && [
                ...(notes.opened ?? []).map((o) => `${o}.`),
                notes.bad ? plural(t.compare.bad, notes.bad, { n: formatInt(notes.bad, t.num) }) : '',
                notes.dup ? plural(t.compare.dup, notes.dup, { n: formatInt(notes.dup, t.num) }) : '',
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
              {/* Gone at COMPARE_MAX lists (the head's line says "Up to 6 lists."); back when a row is removed. */}
              {!full && (
                <button ref={addRef} type="button" className="eb-textbtn" onClick={add} data-testid="compare-add">
                  <Plus aria-hidden="true" focusable="false" />
                  {t.compare.addBirder}
                </button>
              )}
              {/* Compare at the foot's right, its edge on the link boxes' (Enter in a box submits too). */}
              <button type="submit" className="eb-btn eb-compare-submit" disabled={lists.length < 2} aria-describedby={lists.length < 2 ? `${id}-wait` : undefined} data-testid="compare-submit">
                {t.compare.submit}
              </button>
              <span id={`${id}-wait`} hidden>{t.compare.needMore}</span>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
