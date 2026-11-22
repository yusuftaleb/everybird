import { CaretDownIcon, ChartBarIcon, ChartLineIcon, CompassIcon, XIcon } from '@phosphor-icons/react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DayChart } from '@/components/DayChart'
import { DeltaBadge } from '@/components/DeltaBadge'
import { COMPARE_UNAVAILABLE } from '@/components/FilterBar'
import { Notices } from '@/components/Notices'
import { ErrorState, NoCoverage, NoEvents, OverviewSkeleton } from '@/components/States'
import { Tween } from '@/components/Tween'
import { useActions } from '@/app/context'
import { useReducedMotion } from '@/app/hooks'
import { store, type Snapshot } from '@/app/store'
import { TREND_INFO, countryName, fmt, fmt1, formatDay, formatRange, formatShort, label } from '@/lib/format'
import { deltaInfo, pacificDay, pct } from '@/lib/pure'

/** pct for display: its no-denominator dash reads as 'n/a' (UI copy uses no en dashes). */
const share = (a: number, b: number) => (b ? pct(a, b) : 'n/a')
import { cn } from '@/lib/utils'
import { TRENDS, workspaceObservation, type DimensionKey, type MeasureKey, type Trend, type WorkspaceData, type WorkspaceState } from '@/lib/workspace'

const sum = (rows: Record<Trend, number>[], m: Trend) => rows.reduce((a, d) => a + d[m], 0)
const CUTOVER_DAY = '2026-11-16'

export function Overview({ snap }: { snap: Snapshot }) {
  const { s, data, dataKey } = snap
  const current = !!data && dataKey === store.queryKey(s)
  if (snap.error && !snap.stale) return <ErrorState message={snap.error} />
  if (!current || !data) return <OverviewSkeleton />
  if (!data.coverage.available) return <NoCoverage first={data.coverage.first} />
  const dim = snap.refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'
  if (!data.summary.events) return <div className="flex flex-col gap-3"><NoEvents range={formatRange(data.range.from, data.range.to)} /><Notices warnings={data.warnings} /></div>
  return (
    <div className={cn('flex flex-col gap-4', dim)}>
      <TrendCard data={data} s={s} />
      <Notices warnings={data.warnings} />
      <Card className="gap-0 p-0 lg:grid lg:grid-cols-2">
        <TopN title="Countries" dimension="country" rows={data.countries} total={data.summary.active} selected={s.country} />
        <TopN title="Devices" dimension="device" rows={data.devices} total={data.summary.active} selected={s.device} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <HourlyCard data={data} />
        <ActionsCard data={data} />
      </div>
      <LaunchCard data={data} />
    </div>
  )
}

/* The metric strip (a tablist) and the one large chart it drives. */
function TrendCard({ data, s }: { data: WorkspaceData; s: WorkspaceState }) {
  const { go, explore } = useActions()
  const [mode, setMode] = useState<'line' | 'bar'>('line')
  const [picked, setPicked] = useState('')
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const r = data.range, cmp = s.compare && r.compareAvailable
  const period = 'previous ' + r.days + (r.days === 1 ? ' day' : ' days')
  const today = pacificDay(Date.now())
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TRENDS.indexOf(s.trend)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % TRENDS.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + TRENDS.length) % TRENDS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TRENDS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    go({ trend: TRENDS[next] })
    tabs.current[next]?.focus()
  }
  const info = TREND_INFO[s.trend]
  const unit = s.trend === 'active' ? 'visitor-days' : info.unit
  const rows = data.daily.map((d, i) => ({ day: d.day, value: d[s.trend], ...(cmp ? { prev: data.previous[i]?.[s.trend] ?? 0, prevDay: data.previous[i]?.day } : {}) }))
  const total = sum(data.daily, s.trend), peak = rows.reduce((a, x) => (x.value > a.value ? x : a), rows[0] ?? { day: '', value: 0 })
  const observation = workspaceObservation(data, s.trend, cmp)
  const markers = [
    ...(data.lifetime.first && data.lifetime.first >= r.from ? [{ day: data.lifetime.first, text: 'Collection began' }] : []),
    { day: CUTOVER_DAY, text: '31-hour day' },
  ]
  const exploreMeasure: MeasureKey = s.trend
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div role="tablist" aria-label="Metrics" onKeyDown={onKey} className="grid grid-cols-2 gap-px border-b bg-hairline sm:grid-cols-3 xl:grid-cols-6">
        {TRENDS.map((m, i) => {
          const selected = s.trend === m
          const value = m === 'active' ? data.summary.active / r.days : data.summary[m]
          const delta = cmp ? deltaInfo(sum(data.daily, m), sum(data.previous, m)) : null
          return (
            <button
              key={m}
              ref={(el) => { tabs.current[i] = el }}
              type="button"
              role="tab"
              id={'tab-' + m}
              aria-selected={selected}
              aria-controls="trend-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => go({ trend: m })}
              className={cn('relative flex min-w-0 flex-col items-start gap-2 bg-card px-4 pt-4 pb-3.5 text-left transition-colors',
                !selected && 'hover:bg-muted')}
            >
              <span className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left bg-signal transition-transform duration-200 motion-reduce:transition-none', selected ? 'scale-x-100' : 'scale-x-0')} aria-hidden />
              <span className="text-[13px] leading-none font-medium text-muted-foreground">{TREND_INFO[m].label}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[28px] leading-[1.1] font-medium tracking-[-0.025em] text-foreground"><Tween value={value} format={m === 'active' ? fmt1 : (n) => fmt(Math.round(n))} /></span>
                {delta && <DeltaBadge delta={delta} period={period} />}
              </span>
              <span className="text-xs text-tertiary">
                {m === 'active' ? 'avg per day · ' + fmt(data.summary.active) + ' visitor-days total' : TREND_INFO[m].unit + ' in ' + r.days + (r.days === 1 ? ' day' : ' days')}
              </span>
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id="trend-panel" aria-labelledby={'tab-' + s.trend} className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{info.label} per day</h2>
            <p className="text-xs text-muted-foreground">
              {s.trend === 'active' ? 'Visitor-days: distinct anonymous daily ids with any recorded event.' : 'Events per Pacific day.'}
              {cmp ? ' Dashed: ' + formatRange(r.prevFrom, r.prevTo) + '.' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as 'line' | 'bar')} aria-label="Chart type">
              <ToggleGroupItem value="line" aria-label="Line chart"><ChartLineIcon aria-hidden /></ToggleGroupItem>
              <ToggleGroupItem value="bar" aria-label="Bar chart"><ChartBarIcon aria-hidden /></ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => explore(exploreMeasure, 'day')}><CompassIcon aria-hidden />Explore this</Button>
          </div>
        </div>
        <DayChart
          rows={rows} mode={mode} unit={unit} today={today} markers={markers} onPick={setPicked}
          label={info.label + ' per day, ' + formatRange(r.from, r.to) + ': ' + fmt(total) + ' ' + unit + ' in total, peak ' + fmt(peak.value) + ' on ' + formatDay(peak.day) + '. Exact values are in the daily table below.'}
        />
        {picked && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span>{formatDay(picked)}: {fmt(rows.find((x) => x.day === picked)?.value ?? 0)} {unit}</span>
            <Button size="sm" onClick={() => { go({ preset: 'custom', from: picked, to: picked }); setPicked('') }}>Show only {formatShort(picked)}</Button>
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => setPicked('')}><XIcon aria-hidden /></Button>
          </div>
        )}
        {observation && <p className="text-sm text-muted-foreground">{(s.trend === 'active' ? 'Active visitor-days: ' : 'Events: ') + observation + ' Previous: ' + formatRange(r.prevFrom, r.prevTo) + '.'}</p>}
        {s.compare && !r.compareAvailable && <p className="text-xs text-muted-foreground">{COMPARE_UNAVAILABLE}</p>}
        <DailyTable rows={rows} unit={unit} onPick={(day) => go({ preset: 'custom', from: day, to: day })} />
      </div>
    </Card>
  )
}

function DailyTable({ rows, unit, onPick }: { rows: { day: string; value: number; prev?: number }[]; unit: string; onPick: (day: string) => void }) {
  const [open, setOpen] = useState(false)
  const hasPrev = rows.some((r) => r.prev !== undefined)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <CaretDownIcon className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
          {open ? 'Hide exact daily values' : 'Show exact daily values'}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 overflow-auto rounded-md border" tabIndex={0} role="region" aria-label="Daily values">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow><TableHead>Day</TableHead><TableHead className="text-right">{unit}</TableHead>{hasPrev && <TableHead className="text-right">Previous period</TableHead>}<TableHead><span className="sr-only">Action</span></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.day}>
                  <TableCell className="font-mono text-xs">{r.day}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.value)}</TableCell>
                  {hasPrev && <TableCell className="text-right text-muted-foreground tabular-nums">{fmt(r.prev ?? 0)}</TableCell>}
                  <TableCell className="text-right"><Button variant="link" size="sm" className="h-auto p-0" onClick={() => onPick(r.day)}>Show only this day</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* "Top N" cards: a proportional bar behind each name, the exact value right; a row applies that filter. */
function TopN({ title, dimension, rows, total, selected }: { title: string; dimension: 'country' | 'device'; rows: { key: string; value: number }[]; total: number; selected: string }) {
  const { go, explore } = useActions()
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, 8)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const name = (k: string) => (dimension === 'country' ? countryName(k) : label('device', k))
  return (
    <section className="flex flex-col gap-3 border-hairline py-4 max-lg:[&:first-child]:border-b lg:[&:first-child]:border-r" aria-label={title}>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>{title}</CardTitle>
        <CardDescription className="text-xs">{dimension === 'country' ? 'Active visitor-days by request location (not referral sites)' : 'Active visitor-days by coarse device class'}</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={() => explore('active', dimension)}><CompassIcon aria-hidden />Explore this</Button></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {!rows.length && <p className="text-sm text-muted-foreground">No recorded activity for these filters.</p>}
        <ol className="flex flex-col gap-0.5">
          {shown.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                disabled={selected === r.key}
                onClick={() => go(dimension === 'country' ? { country: r.key } : { device: r.key })}
                aria-label={name(r.key) + ': ' + fmt(r.value) + ' visitor-days, ' + share(r.value, total) + ' of active visitor-days. ' + (selected === r.key ? 'Current filter.' : 'Filter to ' + name(r.key) + '.')}
                className="group relative flex h-8 w-full items-center gap-3 overflow-hidden rounded-md px-2 text-left text-sm hover:bg-muted disabled:cursor-default"
              >
                <span aria-hidden className="absolute inset-y-0.5 left-0 rounded-sm bg-signal/14 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: (r.value / max) * 100 + '%' }} />
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">{name(r.key)}</span>
                  {dimension === 'country' && <span className="font-mono text-[11px] text-muted-foreground">{r.key}</span>}
                </span>
                <span className="relative tabular-nums">{fmt(r.value)}</span>
                <span className="relative w-12 text-right text-xs text-muted-foreground tabular-nums">{share(r.value, total)}</span>
              </button>
            </li>
          ))}
        </ol>
        {rows.length > 8 && (
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? 'Show top 8' : 'Show all ' + rows.length}
          </Button>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Share of {fmt(total)} active visitor-days. A visitor-day can fall in more than one category, so rows don't add up to the total.</p>
      </CardContent>
    </section>
  )
}

const hourConfig = { value: { label: 'Recorded visits', color: 'var(--chart-1)' } } satisfies ChartConfig

function HourlyCard({ data }: { data: WorkspaceData }) {
  const { explore } = useActions()
  const reduced = useReducedMotion()
  const timed = data.hourly.hours.reduce((a, r) => a + r.value, 0)
  const rows = data.hourly.hours.map((h) => ({ key: h.key, hour: h.key.padStart(2, '0'), value: h.value }))
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Visits by hour (Pacific)</CardTitle>
        <CardDescription className="text-xs">Recorded visits by Pacific receipt hour, summed over the range. Each page counts once per anonymous visitor per day.</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={() => explore('visits', 'hour')}><CompassIcon aria-hidden />Explore this</Button></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {timed ? (
          <>
            <ChartContainer config={hourConfig} className="aspect-auto h-[180px] w-full" aria-hidden>
              <BarChart data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} accessibilityLayer={false}
                onClick={(e) => { const i = Number(e?.activeTooltipIndex); if (Number.isInteger(i) && rows[i]) explore('visits', 'day', { hour: rows[i].key }) }} className="cursor-pointer">
                <CartesianGrid vertical={false} stroke="var(--hairline)" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={2} tickMargin={6} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={({ active, payload }) => {
                  const p = active && payload?.[0] ? (payload[0].payload as (typeof rows)[number]) : null
                  return p ? <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-popover"><p className="font-medium">{p.hour}:00-{p.hour}:59 Pacific: {fmt(p.value)} visits</p><p className="text-muted-foreground">Click to explore this hour</p></div> : null
                }} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} isAnimationActive={!reduced} animationDuration={300} />
              </BarChart>
            </ChartContainer>
            <table className="sr-only">
              <caption>Recorded visits by Pacific hour</caption>
              <thead><tr><th scope="col">Hour</th><th scope="col">Visits</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.key}><td>{r.hour}:00</td><td>{r.value}</td></tr>)}</tbody>
            </table>
          </>
        ) : <p className="py-6 text-sm text-muted-foreground">Hourly history is unavailable for this selection: these visits were recorded before receipt times were kept.</p>}
        <p className="text-xs text-muted-foreground">
          {fmt(timed)} timestamped visits.{data.hourly.withoutTime ? ' ' + fmt(data.hourly.withoutTime) + ' earlier visits have no time.' : ''}
        </p>
      </CardContent>
    </Card>
  )
}

const ACTIVITY: [string, keyof WorkspaceData['summary'], MeasureKey, DimensionKey][] = [
  ['Personal-list collages', 'collages', 'collages', 'source'], ['Demo collages', 'demos', 'demos', 'day'], ['Restored collages', 'restores', 'restores', 'day'],
  ['Image downloads', 'images', 'images', 'format'], ['Poster downloads', 'posterDownloads', 'posterDownloads', 'fileType'], ['Links copied', 'links', 'links', 'linkType'],
  ['Share actions', 'shares', 'shares', 'shareType'], ['Posters made', 'posters', 'posters', 'posterSize'], ['Searches applied', 'searches', 'searches', 'searchType'],
  ['Filters used', 'filters', 'filters', 'filterType'],
]

function ActionsCard({ data }: { data: WorkspaceData }) {
  const { explore } = useActions()
  const sm = data.summary
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>What people did</CardTitle>
        <CardDescription className="text-xs">Events in {formatRange(data.range.from, data.range.to)}. Independent actions, not an ordered funnel.</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={() => explore('collages', 'source')}><CompassIcon aria-hidden />Explore this</Button></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {ACTIVITY.map(([name, key, measure, dimension]) => (
            <div key={key} className="flex items-center justify-between border-b border-dashed py-1.5 text-sm">
              <dt><button type="button" className="text-left hover:text-primary hover:underline" onClick={() => explore(measure, dimension)} aria-label={'Explore ' + name.toLowerCase()}>{name}</button></dt>
              <dd className="tabular-nums">{fmt(sm[key])}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Action reach (share of {fmt(sm.active)} active visitor-days)</h3>
          <dl className="grid grid-cols-3 gap-2">
            {([['Made a collage', sm.makers], ['Downloaded', sm.downloaders], ['Shared', sm.sharers]] as const).map(([t, n]) => (
              <div key={t} className="rounded-md bg-muted px-3 py-2">
                <dt className="text-xs text-muted-foreground">{t}</dt>
                <dd className="text-lg font-medium tabular-nums">{share(n, sm.active)}</dd>
                <dd className="text-[11px] text-muted-foreground tabular-nums">{fmt(n)} visitor-days</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}

function LaunchCard({ data }: { data: WorkspaceData }) {
  const l = data.lifetime
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Since launch · ignores filters</CardTitle>
        <CardDescription className="text-xs">All dates, request locations and devices, whatever is selected above.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">First collection day</dt><dd className="font-mono text-sm">{l.first ?? 'None yet'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Personal-list collages</dt><dd className="text-lg font-medium tabular-nums">{fmt(l.collages)} <span className="text-xs font-normal text-muted-foreground">events</span></dd></div>
          <div><dt className="text-xs text-muted-foreground">Downloads</dt><dd className="text-lg font-medium tabular-nums">{fmt(l.downloads)} <span className="text-xs font-normal text-muted-foreground">events</span></dd></div>
        </dl>
      </CardContent>
    </Card>
  )
}
