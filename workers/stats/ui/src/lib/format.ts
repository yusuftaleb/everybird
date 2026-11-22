// Labels and number/date formatting for the console. No DOM and no React. Dates are YYYY-MM-DD strings read as calendar
// dates (formatted in UTC so the browser's zone never shifts them); copy uses hyphens, never en or em dashes.
import type { Trend } from './workspace'

export const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString('en-US')
export const fmt1 = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })

let regions: Intl.DisplayNames | null = null
try { regions = new Intl.DisplayNames(['en'], { type: 'region' }) } catch { regions = null }
/** A request location's name from its ISO code; XX (no location) is "Unknown location". */
export function countryName(k: string): string {
  if (!k || k === 'XX') return 'Unknown location'
  try { return regions ? regions.of(k) || k : k } catch { return k }
}

const NAMES: Record<string, string> = {
  iphone: 'iPhone', ipad: 'iPad', mac: 'Mac', windows: 'Windows', linux: 'Linux', chromeos: 'ChromeOS', 'android-phone': 'Android phone', 'android-tablet': 'Android tablet',
  'other-tablet': 'Other tablet', 'other-phone': 'Other phone', other: 'Other device', ebird: 'eBird export', 'ebird-list': 'eBird life list', inat: 'iNaturalist',
  obsorg: 'Observation.org', sheet: 'Spreadsheet', scythebill: 'Scythebill', igoterra: 'iGoTerra', manual: 'By hand', mixed: 'Mixed sources', sample: 'Demo', restore: 'Restore', image_downloaded: 'Image', poster_downloaded: 'Poster',
  place: 'Place', continent: 'Continent', time: 'Time', status: 'Conservation status', group: 'Bird group', taxonomy: 'Taxonomy', smart: 'Smart search', bird: 'Bird search',
  landing: 'Landing page', collage: 'Collage page', settings: 'Settings', about: 'About', shared: 'Shared page', compare: 'Compare page', 'compare-shared': 'Shared comparison',
}
/** Names that depend on the dimension: the same value means another thing in another event ("collage", "country"). */
const BY_DIMENSION: Record<string, Record<string, string>> = {
  imageView: { collage: 'Collage', list: 'List', map: 'Map', tree: 'Tree', comparison: 'Comparison', 'wish-list': 'Wish list' },
  openedView: { list: 'List', map: 'Map', tree: 'Tree' },
  batchSplit: { family: 'By family', order: 'By order', country: 'By country', continent: 'By continent', province: 'By state or province', year: 'By year', size: 'By number of birds' },
}
/** The interface's 14 languages (pt is Brazilian Portuguese there), then any browser language Intl can name. */
const UI_LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese (Brazil)', nl: 'Dutch', pl: 'Polish', fr: 'French', de: 'German', it: 'Italian', sv: 'Swedish', da: 'Danish',
  ru: 'Russian', ja: 'Japanese', 'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)',
}
let languages: Intl.DisplayNames | null = null
try { languages = new Intl.DisplayNames(['en'], { type: 'language' }) } catch { languages = null }
/** A language's English name: the interface language ("Chinese (Traditional)"), or a browser language's primary subtag ("pt" is "Portuguese"). */
export function languageName(code: string, ui = false): string {
  if (ui || code.startsWith('zh-')) return UI_LANGUAGES[code] || code
  try { return (languages && languages.of(code)) || code } catch { return code }
}
/** A category's display name for a dimension. */
export function label(dimension: string, k: string): string {
  if (k === '__other') return 'Other categories'
  if (k === '') return dimension === 'hour' ? 'Without a timestamp' : 'Unknown'
  if (dimension === 'country') return countryName(k)
  if (dimension === 'hour') return String(k).padStart(2, '0') + ':00'
  if (dimension === 'day') return formatDay(k)
  if (dimension === 'uiLanguage' || dimension === 'language') return languageName(k, dimension === 'uiLanguage')
  if (dimension === 'listCount') return k + ' lists'
  return BY_DIMENSION[dimension]?.[k] || NAMES[k] || k
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const parts = (d: string) => { const t = new Date(d + 'T00:00:00Z'); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), w: t.getUTCDay() } }
/** "10 Nov 2026" */
export function formatDay(d: string): string { if (!d) return ''; const p = parts(d); return p.d + ' ' + MONTHS[p.m] + ' ' + p.y }
/** "10 Nov" */
export function formatShort(d: string): string { if (!d) return ''; const p = parts(d); return p.d + ' ' + MONTHS[p.m] }
/** "Mon 10 Nov" */
export function formatWeekday(d: string): string { if (!d) return ''; const p = parts(d); return WEEKDAYS[p.w] + ' ' + p.d + ' ' + MONTHS[p.m] }
/** "3-16 Nov 2026", "28 Oct-3 Nov 2026", "28 Dec 2025-3 Jan 2026", or one day. */
export function formatRange(from: string, to: string): string {
  if (!from || !to) return ''
  if (from === to) return formatDay(from)
  const a = parts(from), b = parts(to)
  if (a.y !== b.y) return formatDay(from) + '-' + formatDay(to)
  if (a.m !== b.m) return a.d + ' ' + MONTHS[a.m] + '-' + b.d + ' ' + MONTHS[b.m] + ' ' + b.y
  return a.d + '-' + b.d + ' ' + MONTHS[b.m] + ' ' + b.y
}
/** "14:02" in Pacific time from an ISO instant. */
export function pacificTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Vancouver', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
/** "12 s ago", "3 min ago", "2 h ago". */
export function ago(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (s < 60) return s + ' s ago'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  return Math.floor(s / 3600) + ' h ago'
}

export const PRESET_LABELS: Record<string, string> = { today: 'Today', '7': 'Previous 7 days', '14': 'Previous 14 days', '30': 'Previous 30 days', all: 'All time', custom: 'Custom range' }

/** The metric strip: label, the unit its value is in, and the Explore measure it opens. */
export const TREND_INFO: Record<Trend, { label: string; unit: string; short: string }> = {
  active: { label: 'Active visitor-days', unit: 'visitor-days', short: 'avg per day' },
  collages: { label: 'Personal collages', unit: 'events', short: 'collage events' },
  downloads: { label: 'Downloads', unit: 'events', short: 'image and poster downloads' },
  shares: { label: 'Share actions', unit: 'events', short: 'share events' },
  visits: { label: 'Recorded visits', unit: 'deduplicated visits', short: 'deduplicated visits' },
  posters: { label: 'Posters made', unit: 'events', short: 'poster events' },
}
