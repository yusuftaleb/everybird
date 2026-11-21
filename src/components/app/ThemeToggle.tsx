'use client'
import { Moon, Sun } from '@/components/phosphor-icons'
import { useSyncExternalStore } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { applyTheme, currentTheme, subscribeTheme } from '@/lib/theme'

/** Light or dark, as the site's sun/moon button in the top bar. Light is the default; the choice is kept per device. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as const)
  const dark = theme === 'dark'
  const { t } = useI18n()
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label={t.shell.darkMode} className="eb-theme" onClick={() => applyTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun aria-hidden="true" focusable="false" /> : <Moon aria-hidden="true" focusable="false" />}
    </button>
  )
}
