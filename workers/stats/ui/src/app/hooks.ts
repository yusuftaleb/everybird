import { useEffect, useRef, useState } from 'react'

/** True when the reader asked for reduced motion; follows changes. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(query), on = () => setReduced(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

/** A number that eases to its new value over 400 ms (ease-out-expo); instant under reduced motion. */
export function useTween(value: number, ms = 400): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) { from.current = value; setShown(value); return }
    const start = performance.now(), a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = k === 1 ? 1 : 1 - Math.pow(2, -10 * k)
      const v = a + (value - a) * e
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, reduced])
  return shown
}

/** The clock, re-read every `every` ms (for "Updated 12 s ago"). */
export function useNow(every = 5000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t) }, [every])
  return now
}

const THEME_KEY = 'everybird:theme'
/** Light unless "dark" is stored; the toggle stores the choice. index.html applies it before the first paint. */
export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light') } catch { /* storage unavailable: the choice lasts this page */ }
    setDark(next)
  }
  return [dark, toggle]
}
