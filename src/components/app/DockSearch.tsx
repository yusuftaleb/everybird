'use client'
// The collage search, after Photography's dock (framer-site photography/TaxonomyExplorer.tsx): a magnifier button
// in the dock; opening it fades the tabs and tools out (made inert by ControlsBar) and a full-width field in, with
// "Find a bird" and ✕. Results drop below the dock at full width with the soft two-layer shadow and read
// "Common name (scientific)" over the orders, families and species of the whole list (as Photography searches every
// kingdom): matches in the current filter first, then the rest under "Elsewhere on the list", each showing where it
// lives (its order). Picking an order or family drills into it; picking a species shows that bird, clearing the
// filters that hide it (CollageView). Esc or ✕ closes and returns focus to the magnifier; a press outside, or focus
// leaving the search, closes it.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CloseIcon, SearchIcon } from '@/components/collage/icons'
import type { SpeciesIndex } from '@/lib/species/load'
import { searchCollage, type CollageHit } from '@/lib/species/name-search'
import { orderLabel } from '@/lib/species/orders'

export type DockSearchProps = {
  /** The whole list: what the search covers. */
  entries: readonly { code: string }[]
  /** The codes on show under the current filter (left out: no filter, everything is on show). */
  shown?: ReadonlySet<string>
  species: SpeciesIndex
  onPick: (hit: CollageHit) => void
  /** "your" on the birder's own collage, "this" on the sample and a shared one. */
  whose?: 'your' | 'this'
}

const RANK: Record<CollageHit['kind'], string> = { order: 'Order', family: 'Family', species: 'Species' }

type Props = DockSearchProps & {
  open: boolean
  onOpen: () => void
  /** `restore`: put focus back on the magnifier (Esc, ✕). */
  onClose: (restore: boolean) => void
  /** The element whose inside doesn't count as "outside" (the dock and its results). */
  within: React.RefObject<HTMLElement | null>
}

/** The magnifier button (in the dock's tools). */
export function SearchButton({ onOpen, open, buttonRef }: { onOpen: () => void; open: boolean; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button ref={buttonRef} type="button" className="eb-dock-tab eb-dock-find" aria-label="Find a bird" aria-expanded={open} onClick={onOpen}>
      <SearchIcon />
    </button>
  )
}

/** Where a hit lives, in the results' right-hand column: its kind and count, and its order when outside the filter. */
function rankText(h: CollageHit, filtered: boolean): string {
  const what = h.kind === 'species' ? RANK.species : `${RANK[h.kind]} · ${h.count.toLocaleString('en-US')}`
  return filtered && !h.inFilter && h.kind !== 'order' ? `${orderLabel(h.order)} · ${what}` : what
}

/** The field over the dock and the results under it, while the search is open. */
export function DockSearchField({ entries, shown, species, onPick, whose = 'this', open, onClose, within }: Omit<Props, 'onOpen'>) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(-1)
  const typed = query.trim().length > 0
  const hits = useMemo(() => (typed ? searchCollage(entries, query, species, { shown }) : []), [entries, query, species, typed, shown])
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
  const pick = (h: CollageHit) => { setQuery(''); setCursor(-1); onPick(h) }
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
      const h = hits[at >= 0 ? at : 0]
      if (h) { e.preventDefault(); pick(h) }
    }
  }

  return (
    <>
      <div
        className="eb-find"
        onBlur={(e) => { if (!within.current?.contains(e.relatedTarget as Node)) onClose(false) }}
      >
        <SearchIcon className="eb-find-icon" />
        <label className="eb-sr" htmlFor={`${id}-q`}>Find a bird</label>
        <input
          ref={input}
          id={`${id}-q`}
          className="eb-find-input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-expanded={typed}
          aria-activedescendant={at >= 0 ? `${id}-r${at}` : undefined}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Find a bird"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(-1) }}
          onKeyDown={onKey}
        />
        <button type="button" className="eb-dock-tab eb-dock-find" aria-label="Close search" onClick={() => onClose(true)}>
          <CloseIcon />
        </button>
      </div>
      {typed && (
        <ul ref={list} id={`${id}-results`} role="listbox" aria-label="Matching birds and groups" className="eb-results">
          {hits.map((h, i) => [
            i === firstOutside && (
              <li key="elsewhere" role="presentation" className="eb-mono eb-results-sep">Elsewhere on the list</li>
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
              <span className="eb-mono eb-result-rank">{rankText(h, !!shown)}</span>
            </li>,
          ])}
          {!hits.length && <li className="eb-results-empty" role="presentation">No bird on {whose} list matches “{query.trim()}”.</li>}
        </ul>
      )}
      <span className="eb-sr" role="status" aria-live="polite">{typed ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}` : ''}</span>
    </>
  )
}
