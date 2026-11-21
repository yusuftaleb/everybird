'use client'
// Settings > Language: "Show bird names in English", when the UI isn't English. The language itself is chosen in the
// top bar's language menu (LanguageMenu), which changes the bird names with it; Settings has no language select
// (Yusuf, 2026-11-20). The switch lives in localStorage `everybird:en-names`, per device, and never touches the saved
// list, backups or links.
import { SettingRow } from '@/components/import/RulesSwitches'
import { useI18n } from '@/i18n/I18nProvider'
import { setEnglishNames } from '@/lib/species/names'
import { useEnNames } from '@/lib/species/use-names'

export { EN_NAMES_KEY } from '@/lib/species/names'

/** "Show bird names in English" (a SettingRow), only when the UI isn't English. The names follow it (species/names.ts). */
export function EnglishNamesSwitch() {
  const { lang, t } = useI18n()
  const on = useEnNames()
  if (lang === 'en') return null
  return (
    <ul className="eb-setgroup eb-langnames">
      <SettingRow label={t.settings.enNames.label} note={t.settings.enNames.note} checked={on} onChange={setEnglishNames} />
    </ul>
  )
}
