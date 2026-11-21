'use client'
// The dock search's magnifier (DockSearch.tsx is the field and its results): a module of its own, so the controls bar
// shows it without loading the search, which ControlsBar loads lazily.
import { SearchIcon } from '@/components/collage/icons'
import { useI18n } from '@/i18n/I18nProvider'

/** The magnifier button (in the dock's tools). */
export function SearchButton({ onOpen, open, buttonRef }: { onOpen: () => void; open: boolean; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  const { t } = useI18n()
  return (
    <button ref={buttonRef} type="button" className="eb-dock-tab eb-dock-find" aria-label={t.collage.search.find} aria-expanded={open} onClick={onOpen}>
      <SearchIcon />
    </button>
  )
}
