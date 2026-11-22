import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react'
import type { Delta } from '@/lib/pure'
import { cn } from '@/lib/utils'

/** The change against the previous period: green up, red down, "New" from zero, "No change", nothing when there was nothing either time. */
export function DeltaBadge({ delta, period }: { delta: Delta; period: string }) {
  if (delta.dir === 'none') return null
  const text = delta.dir === 'new' ? 'New' : delta.dir === 'flat' ? '0%' : delta.pct + '%'
  const spoken = delta.dir === 'new' ? 'new: none in the ' + period : delta.dir === 'flat' ? 'no change from the ' + period : (delta.dir === 'up' ? 'up ' : 'down ') + delta.pct + '% from the ' + period
  return (
    <span title={spoken} className={cn('inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium tabular-nums',
      delta.dir === 'up' && 'bg-positive/10 text-positive', delta.dir === 'down' && 'bg-negative/10 text-negative',
      (delta.dir === 'flat' || delta.dir === 'new') && 'bg-muted text-muted-foreground')}>
      {delta.dir === 'up' && <ArrowUpIcon size={11} weight="bold" aria-hidden />}
      {delta.dir === 'down' && <ArrowDownIcon size={11} weight="bold" aria-hidden />}
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
