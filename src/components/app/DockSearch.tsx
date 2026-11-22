'use client'
// The collage search, after Photography's dock (framer-site photography/TaxonomyExplorer.tsx): a magnifier button
// in the dock; opening it fades the tabs and tools out (made inert by ControlsBar) and a full-width field in, with
// "Find a bird" and ✕. Results drop below the dock at full width with the soft two-layer shadow and read
// "Common name (scientific)" over the orders, families and species of the whole list (as Photography searches every
// kingdom): matches in the current filter first, then the rest under "Elsewhere on the list", each showing where it
// lives (its order). Picking an order or family drills into it; picking a species shows that bird, clearing the
// filters that hide it (CollageView). Esc or ✕ closes and returns focus to the magnifier; a press outside, or focus
// leaving the search, closes it.
//
// Item 9's smart search: what the query names (a group, a place, a period, a Red List category, "lifers") shows as
// "Understood as" chips under the field, removable with their ×. Enter, or "Show these birds", applies those chips to
// the filter in one action; typing applies nothing. The rest of the query is searched by bird name as before. Open and
// empty, the drop holds one Muted line saying what it understands, with an example ("raptors in Kenya 2024"); it goes
// on the first keystroke.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CloseIcon, SearchIcon } from '@/components/collage/icons'
import { ChipRow } from '@/components/filters/ChipRow'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { regionsIn } from '@/lib/i18n-places'
import type { Filter } from '@/lib/list/filters'
import { timeSummary } from '@/lib/list/filter-summary'
import { track } from '@/lib/analytics'
import { applySmart, nameQuery, shownChips } from '@/lib/search/apply'
import { parseSmart, withoutChip, type Chip as SmartChip } from '@/lib/search/smart'
import { type BirdGroup } from '@/lib/search/groups'
import type { SpeciesIndex } from '@/lib/species/load'
import { IUCN_CATS } from '@/lib/species/iucn'
import { useNames } from '@/lib/species/use-names'
import { searchCollage, searchKey, type CollageHit } from '@/lib/species/name-search'
import { ORDERS, orderLabel } from '@/lib/species/orders'
import type { Regions, SpeciesRow } from '@/lib/species/types'

export type DockSearchProps = {
  /** The whole list: what the search covers. */
  entries: readonly { code: string }[]
  /** The codes on show under the current filter (left out: no filter, everything is on show). */
  shown?: ReadonlySet<string>
  species: SpeciesIndex
  onPick: (hit: CollageHit) => void
  /** "your" on the birder's own collage, "this" on the sample and a shared one. */
  whose?: 'your' | 'this'
  /** The filter now on show: what the understood chips are applied to. */
  filter: Filter
  /** Applies the chips' filter (Enter, "Show these birds"): one action, no live re-pack while typing. */
  onApply: (filter: Filter) => void
  /** The places the query can name (English names; localized for the UI language inside). */
  regions: Regions
  /** Place keys of the whole list (c:, s:, k:), at every level each place has. */
  listPlaces: readonly string[]
  /** Whether the list keeps each place's months (MyEBirdData, iNaturalist). Without them a dates query falls back. */
  hasMonths: boolean
}

type Props = DockSearchProps & {
  open: boolean
  onOpen: () => void
  /** `restore`: put focus back on the magnifier (Esc, ✕, after applying). */
  onClose: (restore: boolean) => void
  /** The element whose inside doesn't count as "outside" (the dock and its results). */
  within: React.RefObject<HTMLElement | null>
}

/** eBird's groups as the species index holds them (loaded with it; the sample's pack brings its own); none without. */
function useGroups(species: SpeciesIndex): readonly BirdGroup[] {
  return useMemo(() => (species.groups ? [...species.groups.values()] : []), [species.groups])
}

/** One species per family on the list: the parser's family names and orders need no more. */
function firstOfEachFamily(entries: readonly { code: string }[], species: SpeciesIndex): SpeciesRow[] {
  const byFam = new Map<string, SpeciesRow>()
  for (const e of entries) {
    const row = species.byCode.get(e.code)
    if (row && !byFam.has(row.fam)) byFam.set(row.fam, row)
  }
  return [...byFam.values()]
}

/** Where a hit lives, in the results' right-hand column: its kind and count, and its order when outside the filter. */
function rankText(h: CollageHit, filtered: boolean, t: Ui): string {
  const rank = t.collage.search[h.kind]
  const what = h.kind === 'species' ? rank : `${rank} · ${formatInt(h.count, t.num)}`
  return filtered && !h.inFilter && h.kind !== 'order' ? `${orderLabel(h.order, t)} · ${what}` : what
}

/** The field over the dock, and under it the drop: the understood chips, a note, the name hits, while the search is open. */
export function DockSearchField({ entries, shown, species, onPick, whose = 'this', open, onClose, within, filter, onApply, regions, listPlaces, hasMonths }: Omit<Props, 'onOpen'>) {
  const { lang, t } = useI18n()
  const s = t.collage.search
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(-1)
  const names = useNames()
  const groups = useGroups(species)
  const localRegions = useMemo(() => regionsIn(regions, lang), [regions, lang])
  const familyRows = useMemo(() => firstOfEachFamily(entries, species), [entries, species])
  const orderNames = useMemo(() => Object.fromEntries(Object.keys(ORDERS).map((o) => [o, orderLabel(o, t)])), [t])
  const statuses = useMemo(() => IUCN_CATS.map((code) => ({ code, name: t.iucn.names[code] })), [t])
  const parsed = useMemo(
    () => (query.trim() ? parseSmart(query, { today: new Date(), lang, groups, regions: localRegions, listPlaces, statuses, species: familyRows, orderNames }) : undefined),
    [query, lang, groups, localRegions, listPlaces, statuses, familyRows, orderNames],
  )
  const typed = query.trim().length > 0
  // Bird names search the query as typed.
  const raw = useMemo(
    () => (typed ? searchCollage(entries, query, species, { shown, t, lang }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
    [entries, query, species, typed, shown, t, lang, names],
  )
  // A query that is exactly a name on the list (a bird's, an order's or a family's, common or scientific, folded as the
  // search folds) is that hit: its words ("canada goose") are never read as a place or a period, and Enter shows it.
  const exact = useMemo(() => {
    const key = searchKey(query)
    return key ? raw.find((h) => searchKey(h.com) === key || searchKey(h.sci) === key) : undefined
  }, [raw, query])
  // The chips the search shows; a period reads as the Filters panel does ("2026", not "2026-01–2026-12").
  const understood: SmartChip[] = useMemo(
    () => (exact ? [] : shownChips(parsed?.chips ?? [])).map((c) => (c.kind === 'date' && parsed ? { ...c, label: timeSummary(parsed.filter as Filter, t) ?? c.label } : c)),
    [parsed, t, exact],
  )
  const kinds = useMemo(() => new Set(understood.map((c) => c.kind)), [understood])
  // With chips and no hit, the words the chips leave over.
  const hits = useMemo(() => {
    if (raw.length || !understood.length) return raw
    const rest = nameQuery(query, parsed?.chips ?? [])
    return rest ? searchCollage(entries, rest, species, { shown, t, lang }) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [raw, entries, query, species, shown, t, lang, names, understood, parsed])
  // With chips, a query with no name left over shows no list and no "no bird matches" line.
  const listOpen = hits.length > 0 || (typed && !understood.length)
  const needsMonths = whose === 'your' && !hasMonths && parsed?.filter.basis === 'seen' && kinds.has('date')
  const firstOutside = shown ? hits.findIndex((h) => !h.inFilter) : -1
  const at = cursor < hits.length ? cursor : -1

  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }) }, [open])
  // A press outside the dock and its results closes the search (focus stays where the press put it).
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!within.current?.contains(e.target as Node)) onClose(false) }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [open, onClose, within])
  // Scroll only the results, never the page, to keep the active option in view.
  useEffect(() => {
    const ul = list.current, opt = ul?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!ul || !opt) return
    const top = opt.offsetTop, bottom = top + opt.offsetHeight
    if (top < ul.scrollTop) ul.scrollTop = top
    else if (bottom > ul.scrollTop + ul.clientHeight) ul.scrollTop = bottom - ul.clientHeight
  }, [at])

  if (!open) return null
  const pick = (h: CollageHit) => { setQuery(''); setCursor(-1); track('search_applied', { kind: 'bird' }); onPick(h) }
  const apply = () => {
    if (!parsed) return
    const next = applySmart(filter, parsed.filter, kinds)
    // Without month sets "seen any time" changes nothing (and its labels would mislead): the dates stay lifer dates.
    if (!hasMonths) delete next.basis
    onApply(next)
    track('search_applied', { kind: 'smart' })
    setQuery('')
    setCursor(-1)
    onClose(true)
  }
  const removeChip = (chip: SmartChip) => { setQuery(withoutChip(query, chip)); setCursor(-1) }
  const focusField = () => input.current?.focus({ preventScroll: true })
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = hits.length
      if (!n) return
      setCursor(at < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Enter') {
      if (at < 0 && !exact && understood.length) {
        e.preventDefault()
        apply()
        return
      }
      const h = at >= 0 ? hits[at] : (exact ?? hits[0])
      if (h) { e.preventDefault(); pick(h) }
    }
  }
  // Esc from the chips and the button too; the input handles its own above.
  const onKeyWithin = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
    }
  }

  return (
    <>
      <div
        className="eb-find-wrap"
        onBlur={(e) => { if (!within.current?.contains(e.relatedTarget as Node)) onClose(false) }}
        onKeyDown={onKeyWithin}
      >
        <div className="eb-find">
          <SearchIcon className="eb-find-icon" />
          <label className="eb-sr" htmlFor={`${id}-q`}>{s.find}</label>
          <input
            ref={input}
            id={`${id}-q`}
            className="eb-find-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={`${id}-results`}
            aria-expanded={listOpen}
            aria-activedescendant={at >= 0 ? `${id}-r${at}` : undefined}
            aria-describedby={typed ? undefined : `${id}-hint`}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={s.find}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(-1) }}
            onKeyDown={onKey}
          />
          <button type="button" className="eb-dock-tab eb-dock-find" aria-label={s.close} onClick={() => onClose(true)}>
            <CloseIcon />
          </button>
        </div>
        {(!typed || understood.length > 0 || needsMonths || listOpen) && (
          // A press in the drop keeps focus in the field (as the options do): the chips and the button still click.
          <div className="eb-find-drop" onPointerDown={(e) => e.preventDefault()}>
            {!typed && <p id={`${id}-hint`} className="eb-note eb-find-hint" data-testid="search-hint">{t.search.hint}</p>}
            {understood.length > 0 && (
              <div className="eb-understood">
                <span className="eb-mono eb-understood-label" aria-hidden="true">{t.search.understood}</span>
                <ChipRow chips={understood} label={t.search.understood} onRemove={removeChip} onEmpty={focusField} testId="search-understood" />
                <button type="button" className="eb-btn eb-understood-go" onClick={apply}>{t.search.show}</button>
              </div>
            )}
            {needsMonths && <p className="eb-note eb-understood-note">{t.search.note}</p>}
            {listOpen && (
              <ul ref={list} id={`${id}-results`} role="listbox" aria-label={s.results} className="eb-results">
                {hits.map((h, i) => [
                  i === firstOutside && (
                    <li key="elsewhere" role="presentation" className="eb-mono eb-results-sep">{s.elsewhere}</li>
                  ),
                  <li
                    key={`${h.kind}:${h.value}`}
                    id={`${id}-r${i}`}
                    role="option"
                    aria-selected={i === at}
                    tabIndex={-1}
                    onPointerDown={(e) => e.preventDefault()} // keep focus in the field
                    onPointerEnter={() => setCursor(i)}
                    onClick={() => pick(h)}
                  >
                    <span className="eb-result-name">
                      {h.com}{' '}
                      <span className="eb-result-sci">(<span lang="la" className={h.kind === 'species' ? 'eb-result-it' : undefined}>{h.sci}</span>)</span>
                    </span>
                    <span className="eb-mono eb-result-rank">{rankText(h, !!shown, t)}</span>
                  </li>,
                ])}
                {!hits.length && <li className="eb-results-empty" role="presentation">{fmt(whose === 'your' ? s.noneYour : s.noneThis, { q: query.trim() })}</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      <span className="eb-sr" role="status" aria-live="polite">{typed ? plural(s.matches, hits.length, { n: formatInt(hits.length, t.num) }) : ''}</span>
    </>
  )
}
