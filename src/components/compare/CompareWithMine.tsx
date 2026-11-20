'use client'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useI18n } from '@/i18n/I18nProvider'
import { handOff } from '@/lib/share/compare-handoff'
import Link from '@/components/app/IntentLink'
import './compare.css'

/**
 * "Compare with mine" on a shared collage or comparison: opens /compare with `path` (the page's own /s/ or /c/ path)
 * handed over in sessionStorage, never in the address. The shared views turn it into a full page load (FullNavigation).
 */
export function CompareWithMine({ path }: { path: string }) {
  const { t } = useI18n()
  return (
    <Link className="eb-btn eb-btn-big eb-btn-quiet eb-hero-cta" href="/compare" onClick={() => handOff(path)} data-testid="compare-with-mine">
      <ArrowsLeftRight aria-hidden="true" focusable="false" weight="bold" />
      {t.compare.withMine}
    </Link>
  )
}
