import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useActions } from '@/app/context'
import { useNow } from '@/app/hooks'
import { store, type Snapshot } from '@/app/store'
import { ago, countryName, formatRange, label, pacificTime } from '@/lib/format'
import { pacificDay } from '@/lib/pure'
import { cn } from '@/lib/utils'

const TITLES = { overview: 'Overview', explore: 'Explore', definitions: 'Definitions' } as const

/** The scope line: "3-16 Nov 2026 · 14 completed days · Pacific time · All countries · All devices". */
export function scopeLine(snap: Snapshot): string {
  const { s, data, dataKey } = snap
  const q = new URLSearchParams(store.queryKey(s))
  const current = !!data && dataKey === q.toString()
  const from = current ? data!.range.from : q.get('from') || '', to = current ? data!.range.to : q.get('to') || ''
  const days = current ? data!.range.days : Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
  const today = pacificDay(Date.now())
  const span = s.preset === 'all' && !current ? 'All recorded days' : formatRange(from, to)
  const count = to >= today ? days + (days === 1 ? ' day' : ' days') + ', today incomplete' : days + (days === 1 ? ' completed day' : ' completed days')
  return [span, count, 'Pacific time', s.country ? countryName(s.country) : 'All countries', s.device ? label('device', s.device) : 'All devices'].join(' · ')
}

export function TitleRow({ snap }: { snap: Snapshot }) {
  const { refresh } = useActions()
  const now = useNow(5000)
  const { s, data } = snap
  const busy = snap.loading || snap.refreshing
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pt-6 pb-4">
      <div className="min-w-0">
        <h1 id="heading" tabIndex={-1} className="text-2xl leading-[1.1] font-medium tracking-[-0.025em] outline-none">{TITLES[s.view]}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {s.view === 'definitions' ? 'What is counted, what is missing and how to read it.' : scopeLine(snap)}
        </p>
      </div>
      {s.view !== 'definitions' && (
        <div className="flex items-center gap-3">
          <p className={cn('text-xs text-muted-foreground', snap.stale && 'text-negative')} role="status" aria-live="polite">
            {snap.stale && data ? 'Showing data from ' + pacificTime(data.generatedAt) + '; refresh failed'
              : busy ? 'Loading…'
              : data && snap.receivedAt ? 'Updated ' + ago(snap.receivedAt, now) : ''}
          </p>
          <Button variant="outline" size="sm" onClick={refresh} disabled={busy} aria-label="Refresh data">
            <ArrowClockwiseIcon className={cn(busy && 'animate-spin motion-reduce:animate-none')} aria-hidden />
            Refresh
          </Button>
        </div>
      )}
    </header>
  )
}
