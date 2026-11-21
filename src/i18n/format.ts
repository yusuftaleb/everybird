// Numbers and dates in the UI language, from the strings files' tables. Pure and Intl-free on purpose: Node and the
// browser engines word dates differently (en-GB says "Sept"), and the server and client must render the same text.
import type { Ui } from './messages/en'

type Num = Ui['num']

/** Digits with the language's group separator from 4 digits ("1,089"; es, pt, nl "1.089"). Rounded; '' if not finite. */
export function formatInt(n: number, num: Num): string {
  if (!Number.isFinite(n)) return ''
  const r = Math.round(n)
  const digits = String(Math.abs(r))
  const grouped = digits.length < 4 ? digits : digits.replace(/\B(?=(\d{3})+$)/g, num.group)
  return r < 0 ? `-${grouped}` : grouped
}

/** Body mass, src/lib/format.ts's rules with the language's decimal: whole grams under 1,000 (one decimal under 10),
 *  kilograms with one decimal from 1,000 ("2.4 kg", "2,4 kg"). Never grouped ("1000 g" for 999.6). '' if invalid. */
export function formatMass(g: number, num: Num): string {
  if (!Number.isFinite(g) || g < 0) return ''
  const dec = (x: number) => x.toFixed(1).replace('.', num.decimal)
  if (g >= 1000) return `${dec(g / 1000)} kg`
  if (g < 10) return `${dec(g)} g`
  return `${Math.round(g)} g`
}

/** Japanese and Chinese months ("9月", ui.date.months): the year comes first and dates read "2026年9月", "11月6日". */
export const yearFirst = (months: readonly string[]): boolean => months[0]?.endsWith('月') ?? false

/** 'YYYY-MM-DD' | 'YYYY-MM' -> "Sep 2026" ("sept 2026", "2026年9月"); 'YYYY' -> "2026"; anything else -> "". formatDate's rules. */
export function formatMonth(d: string | undefined, months: readonly string[]): string {
  const m = d && /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/.exec(d)
  if (!m) return ''
  if (!m[2]) return m[1]
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return m[1]
  return yearFirst(months) ? `${m[1]}年${months[mon - 1]}` : `${months[mon - 1]} ${m[1]}`
}

/** A local day: "6 Nov" (yearFirst: "11月6日"), with the year when `withYear`: "1 Mar 2025", "2025年3月1日". */
export function dayText(d: Date, months: readonly string[], withYear: boolean): string {
  if (yearFirst(months)) return `${withYear ? `${d.getFullYear()}年` : ''}${months[d.getMonth()]}${d.getDate()}日`
  const day = `${d.getDate()} ${months[d.getMonth()]}`
  return withYear ? `${day} ${d.getFullYear()}` : day
}

/** A timestamp's local day: "6 Nov" this year, "1 Mar 2025" otherwise (SourceLine's shortDate rules); '' if invalid. */
export function shortDay(iso: string, months: readonly string[], now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return dayText(d, months, d.getFullYear() !== now.getFullYear())
}
