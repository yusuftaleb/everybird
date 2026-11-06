'use client'
import { useMemo, useState } from 'react'
import type { CountryDots } from '@/lib/species/types'
import '../filters/filters.css'

/** Opacity of a lit country by step 0..3 (quartile of lifer counts, lowest to highest). */
export const LIT_OPACITY = [0.6, 0.73, 0.87, 1] as const
const DIMMED = 0.35

/**
 * Quartile step (0..3) for each count, in input order. Counts are ranked from the top: with n lit countries,
 * a country with `above` countries strictly ahead of it gets step 3 - min(3, floor(4 * above / n)).
 * So the top quarter is 3 (full), the bottom quarter 0, ties share a step, and the best country is always 3
 * (1 lit country: [3]; 2: lowest 1; 3: 1, 2, 3).
 */
export function litSteps(counts: number[]): number[] {
  const n = counts.length
  if (!n) return []
  const sorted = [...counts].sort((a, b) => b - a)
  return counts.map((c) => {
    let above = sorted.findIndex((x) => x <= c) // first index not strictly above c
    if (above < 0) above = n
    return 3 - Math.min(3, Math.floor((4 * above) / n))
  })
}

/** Decode once: ISO2 -> "M x y h0 M x y h0 ..." (zero-length segments; round caps turn each into a dot). */
function decode(d: CountryDots): Map<string, string> {
  const bin = atob(d.cells)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const cells = new Uint16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
  const out = new Map<string, string>()
  const add = (iso: string, x: number, y: number) => out.set(iso, `${out.get(iso) ?? ''}M${+x.toFixed(2)} ${+y.toFixed(2)}h0`)
  const step = d.step
  for (let r = 0; r < d.rows; r++) {
    const y = (r + 0.5) * step
    for (let c = 0; c < d.cols; c++) {
      const i = cells[r * d.cols + c]
      if (i) add(d.countries[i], (c + 0.25 + (r % 2) * 0.5) * step, y)
    }
  }
  for (const [iso, x, y] of d.extra) add(iso, x, y)
  return out
}

type Props = {
  dots: CountryDots
  /** Lifer count per ISO2 country; only countries with a count above 0 are lit. */
  counts: Map<string, number>
  selected?: string
  onSelect: (iso2: string | undefined) => void
  countryName?: (iso2: string) => string
}

const species = (n: number) => `${n} species`

/** Dotted world map; countries with lifers are lit in Accent, in four opacity steps. */
export function CountryMap({ dots, counts, selected, onSelect, countryName = (c) => c }: Props) {
  const byCountry = useMemo(() => decode(dots), [dots])
  const [hover, setHover] = useState<string>()

  const lit = useMemo(() => {
    const isos = [...counts].filter(([iso, n]) => n > 0 && byCountry.has(iso)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const steps = litSteps(isos.map(([, n]) => n))
    return isos.map(([iso, n], i) => ({ iso, n, step: steps[i], d: byCountry.get(iso)! }))
  }, [counts, byCountry])

  const land = useMemo(() => {
    const litSet = new Set(lit.map((l) => l.iso))
    let d = ''
    for (const [iso, seg] of byCountry) if (!litSet.has(iso)) d += seg
    return d
  }, [byCountry, lit])

  const toggle = (iso: string) => onSelect(selected === iso ? undefined : iso)
  const shown = hover ?? selected
  const shownN = shown ? counts.get(shown) : undefined
  const height = dots.rows * dots.step

  return (
    <div className="eb-map" data-testid="country-map">
      <svg
        className="eb-map-svg"
        viewBox={`0 0 ${dots.cols * dots.step} ${height}`}
        role="group"
        aria-label="Map of countries you have seen birds in"
      >
        <path className="eb-map-land" d={land} />
        {lit.map(({ iso, n, step, d }) => (
          <g
            key={iso}
            className="eb-map-country"
            data-country={iso}
            onClick={() => toggle(iso)}
            onPointerEnter={() => setHover(iso)}
            onPointerLeave={() => setHover(undefined)}
          >
            <path className="eb-map-hit" d={d} />
            <path
              className="eb-map-lit"
              data-testid={`map-country-${iso}`}
              data-count={n}
              d={d}
              opacity={selected ? (selected === iso ? 1 : DIMMED) : LIT_OPACITY[step]}
            />
          </g>
        ))}
      </svg>
      <p className="eb-map-label eb-mono" aria-live="polite">
        {shown && shownN ? `${countryName(shown)} · ${species(shownN)}` : ' '}
      </p>
      {/* For screen readers; keyboard users choose with the country chips (a hidden focusable button would lose the ring). */}
      <ul className="eb-sr" aria-label="Countries with birds">
        {lit.map(({ iso, n }) => (
          <li key={iso}>
            <button type="button" tabIndex={-1} aria-pressed={selected === iso} onClick={() => toggle(iso)}>
              {`${countryName(iso)}, ${species(n)}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
