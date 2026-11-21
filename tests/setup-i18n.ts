// Unit tests render components without the root layout's I18nProvider: they read English (production has no default,
// so the English dictionary isn't in every page's JavaScript; src/i18n/I18nProvider.tsx).
import { setI18nFallback } from '@/i18n/I18nProvider'
import { EN_UI } from '@/i18n/messages/en-ui'

setI18nFallback({ lang: 'en', t: EN_UI })
