'use client'
// The one bar above the filters, as LifeList's dock (framer-site), with Photography's search, holding three things: the
// view switcher on the left (Collage / List / Map / Tree, then Compare, a link to its own page), then Filters, Style
// and Share side by side, then the magnifier. Filters (Filters.tsx) serves every view; Style (StylePanel.tsx) holds
// what changes the look; Share opens the share dialog. The magnifier turns the dock into the search field
// (DockSearch.tsx); everything else sits under it, inert, while it is open. Under 820px of bar Filters, Style and Share
// take a second row of their own, under 600px filling it (app.css); under 1100px the views are icons only, so row one
// (the views and the magnifier) never breaks between 280 and 1200px of bar.
import { ShareNetwork, UsersThree } from '@phosphor-icons/react'
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import Link from '@/components/app/IntentLink'
import { CollageIcon, ListIcon, MapIcon, TreeIcon } from '@/components/collage/icons'
import { useI18n } from '@/i18n/I18nProvider'
import { useOfferResume, useTakeResume } from '@/lib/use-resume'
import type { ViewKind } from '@/lib/view-resume'
import { DockSearchField, SearchButton, type DockSearchProps } from './DockSearch'
import { StyleButton, StylePanel, type StyleProps } from './StylePanel'

type Props = StyleProps & {
  onView: (v: ViewKind) => void
  /** No Map tab (a view with no places). */
  noMap?: boolean
  /** A Compare entry after the views: a link to /compare (the birder's own collage). */
  compare?: boolean
  /** The Share button (left out: none). */
  share?: { onShare: () => void; disabled?: boolean }
  /** The search (left out: no magnifier). */
  search?: DockSearchProps
  /** The Filters button (inert with its group while the search covers the bar). */
  filters?: ReactNode
  /** After the dock, inside the wrap: the active-filter chips, then the Filters popover (it anchors under them). */
  below?: ReactNode
  /** The search or the Style panel is opening: the caller closes the Filters panel. */
  onFind?: () => void
}

export function ControlsBar({ onView, noMap, compare, share, search, filters, below, onFind, ...style }: Props) {
  const { view } = style
  const [finding, setFinding] = useState(false)
  const [styling, setStyling] = useState(false)
  // Whether the search is open is carried over a language switch (view-resume.ts); the typed text is not.
  const hasSearch = !!search
  useTakeResume('search', (r) => { if (hasSearch) setFinding(r.open) })
  useOfferResume('search', () => (hasSearch ? { open: finding } : undefined))
  const { t } = useI18n()
  const c = t.collage.controls
  const wrap = useRef<HTMLDivElement>(null)
  const findBtn = useRef<HTMLButtonElement>(null)
  const styleBtn = useRef<HTMLButtonElement>(null)
  const styleId = useId()
  const close = useCallback((restore: boolean) => {
    setFinding(false)
    if (restore) requestAnimationFrame(() => findBtn.current?.focus({ preventScroll: true }))
  }, [])
  const closeStyle = useCallback(() => setStyling(false), [])
  const onPick: DockSearchProps['onPick'] = (h) => {
    setFinding(false)
    search?.onPick(h)
  }
  return (
    <div ref={wrap} className="eb-dockwrap">
      <div className="eb-dock" data-finding={finding || undefined}>
        <div className="eb-dock-tabs" role="group" aria-label={c.view} inert={finding} data-tour="view">
          {(noMap ? (['collage', 'list', 'tree'] as const) : (['collage', 'list', 'map', 'tree'] as const)).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={c[v]} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : v === 'list' ? <ListIcon /> : v === 'map' ? <MapIcon /> : <TreeIcon />}
              <span>{c[v]}</span>
            </button>
          ))}
          {compare && (
            // Compare is its own page: the entry takes the birder there (the page has a way back).
            <Link href="/compare" className="eb-dock-tab" aria-label={t.compare.open} data-testid="compare-open">
              <UsersThree aria-hidden="true" focusable="false" />
              <span>{t.compare.open}</span>
            </Link>
          )}
        </div>
        <div className="eb-dock-filters" inert={finding}>
          {filters}
          <StyleButton open={styling} onOpen={(o) => { if (o) onFind?.(); setStyling(o) }} buttonRef={styleBtn} panelId={styleId} />
          {share && (
            <button type="button" className="eb-dock-tab eb-dock-drop" aria-haspopup="dialog" disabled={share.disabled} data-testid="share-open" data-tour="share" onClick={share.onShare}>
              <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
              <span className="eb-drop-label">{t.collage.share}</span>
            </button>
          )}
        </div>
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => { onFind?.(); setStyling(false); setFinding(true) }} buttonRef={findBtn} /></div>}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
      {below}
      {styling && <StylePanel {...style} showDark={!!share} id={styleId} buttonRef={styleBtn} onClose={closeStyle} />}
    </div>
  )
}
