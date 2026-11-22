import { ArrowClockwiseIcon, LockKeyIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActions } from '@/app/context'
import { formatDay } from '@/lib/format'

export function AccessExpired() {
  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <Card className="w-full max-w-sm items-center gap-3 px-6 py-8 text-center">
        <LockKeyIcon size={28} className="text-muted-foreground" aria-hidden />
        <h1 id="heading" tabIndex={-1} className="text-base font-medium outline-none">Your Cloudflare Access session ended</h1>
        <p className="text-sm text-muted-foreground">Sign in again to keep reading the dashboard. Your selections are kept in the address.</p>
        <Button onClick={() => location.reload()}>Reload to sign in</Button>
      </Card>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  const { refresh } = useActions()
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-md border border-negative/30 bg-card px-4 py-3 text-sm">
      <WarningCircleIcon size={18} className="mt-0.5 shrink-0 text-negative" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Data unavailable</p>
        <p className="text-muted-foreground">{message} Your selections are kept.</p>
      </div>
      <Button variant="outline" size="sm" onClick={refresh}><ArrowClockwiseIcon aria-hidden />Retry</Button>
    </div>
  )
}

/** No data at all for the range: before collection began, or nothing recorded yet. */
export function NoCoverage({ first }: { first: string | null }) {
  const { go } = useActions()
  return (
    <Card className="items-start gap-2 px-6 py-8">
      <h2 className="text-sm font-medium">No collection coverage</h2>
      <p className="text-sm text-muted-foreground">
        {first ? 'Collection began on ' + formatDay(first) + '. This period has no collected history; choose dates on or after it.' : 'No analytics have been recorded yet. Refresh after activity is recorded.'}
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => go({ preset: 'all' })}>Show all recorded dates</Button>
    </Card>
  )
}

/** Collected, but nothing happened in the selection. */
export function NoEvents({ range }: { range: string }) {
  const { go } = useActions()
  return (
    <Card className="items-start gap-2 px-6 py-8">
      <h2 className="text-sm font-medium">No events in this range</h2>
      <p className="text-sm text-muted-foreground">Nothing was recorded for {range} under these filters.</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => go({ preset: '30', country: '', device: '', filters: {} })}>Previous 30 days</Button>
    </Card>
  )
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading analytics" role="status">
      <Card className="gap-0 p-0">
        <div className="grid grid-cols-2 border-b sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-2 p-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-20" /></div>)}
        </div>
        <div className="p-4"><Skeleton className="h-[280px] w-full" /></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => <Card key={i} className="gap-3 p-4"><Skeleton className="h-4 w-24" />{Array.from({ length: 6 }, (_, j) => <Skeleton key={j} className="h-7 w-full" />)}</Card>)}
      </div>
    </div>
  )
}

export function ExploreSkeleton() {
  return (
    <Card className="gap-4 p-4" role="status" aria-label="Loading results">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-[280px] w-full" />
      {Array.from({ length: 5 }, (_, j) => <Skeleton key={j} className="h-7 w-full" />)}
    </Card>
  )
}
