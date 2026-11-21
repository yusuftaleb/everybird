'use client'
import { Moon, Sun } from '@phosphor-icons/react'
import { useSyncExternalStore } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { applyTheme, currentTheme, subscribeTheme } from '@/lib/theme'

/** Light or dark, as the site's sun/moon button in the top bar. Light is the default; the choice is kept per device.
 *  Both glyphs are rendered and CSS shows the one for the theme already on <html> (app.css .eb-theme-sun), so a dark
 *  visitor never sees the light glyph swap after hydration (the server snapshot is light). */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as const)
  const dark = theme === 'dark'
  const { t } = useI18n()
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label={t.shell.darkMode} className="eb-theme" onClick={() => applyTheme(dark ? 'light' : 'dark')}>
      <Sun className="eb-theme-sun" aria-hidden="true" focusable="false" />
      <Moon className="eb-theme-moon" aria-hidden="true" focusable="false" />
    </button>
  )
}
