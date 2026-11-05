/** Shared display formatting (card, list view, share image, shared page). */

/** Body mass: whole grams under 1,000 (one decimal under 10), kilograms with one decimal from 1,000. */
export function formatMass(g: number): string {
  if (!Number.isFinite(g) || g < 0) return ''
  if (g >= 1000) return `${(g / 1000).toFixed(1)} kg`
  if (g < 10) return `${g.toFixed(1)} g`
  return `${Math.round(g)} g`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM-DD' | 'YYYY-MM' -> "Sep 2026"; 'YYYY' -> "2026"; anything else -> "". */
export function formatDate(d?: string): string {
  const m = d && /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/.exec(d)
  if (!m) return ''
  if (!m[2]) return m[1]
  const mon = Number(m[2])
  return mon >= 1 && mon <= 12 ? `${MONTHS[mon - 1]} ${m[1]}` : m[1]
}
