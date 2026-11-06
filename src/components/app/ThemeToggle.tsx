'use client'
import { useSyncExternalStore } from 'react'
import { applyTheme, currentTheme, subscribeTheme } from '@/lib/theme'
import '@/components/collage/collage.css'

/** Light or dark, as a switch in the dock's style (LifeList's Scientific switch). Light is the default. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as const)
  const dark = theme === 'dark'
  return (
    <button type="button" role="switch" aria-checked={dark} className="eb-switch eb-theme" onClick={() => applyTheme(dark ? 'light' : 'dark')}>
      <span>Dark mode</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
}
