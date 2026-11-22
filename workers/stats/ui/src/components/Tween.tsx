import { useTween } from '@/app/hooks'

/** A number that eases to each new value; the accessible text is always the final value. */
export function Tween({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useTween(value)
  return (
    <>
      <span aria-hidden className="tabular-nums">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  )
}
