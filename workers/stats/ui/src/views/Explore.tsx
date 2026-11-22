import { BookmarkSimpleIcon, CaretDownIcon, CaretUpIcon, DownloadSimpleIcon, TableIcon, TrashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DayChart } from '@/components/DayChart'
import { Chip } from '@/components/FilterBar'
import { Notices } from '@/components/Notices'
import { ErrorState, ExploreSkeleton, NoCoverage } from '@/components/States'
import { useActions } from '@/app/context'
import { useReducedMotion } from '@/app/hooks'
import { META, store, type Snapshot } from '@/app/store'
import { countryName, fmt, formatRange, label } from '@/lib/format'
import { pacificDay } from '@/lib/pure'
import { parseViews, VIEWS_KEY, withView, type SavedView } from '@/lib/saved-views'
import { cn } from '@/lib/utils'
import { workspaceChartRows, workspaceCsv, workspaceHash, workspaceSort, workspaceState, type DimensionKey, type Display, type MeasureKey, type Row, type WorkspaceData, type WorkspaceState } from '@/lib/workspace'

const VISITOR_MEASURES: MeasureKey[] = ['active', 'visits']
const measureKeys = Object.keys(META.measures) as MeasureKey[]
const dimsOf = (m: MeasureKey) => META.measures[m].dimensions as readonly DimensionKey[]

export function Explore({ snap }: { snap: Snapshot }) {
  const { s } = snap
  const [status, setStatus] = useState('')
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <ConfigCard s={s} setStatus={setStatus} />
      <div className="flex min-w-0 flex-col gap-3">
        <p role="status" aria-live="polite" className="sr-only">{status}</p>
        <Result snap={snap} />
        {snap.data && snap.dataKey === store.queryKey(s) && <Notices warnings={snap.data.warnings} />}
      </div>
    </div>
  )
}

function ConfigCard({ s, setStatus }: { s: WorkspaceState; setStatus: (t: string) => void }) {
  const { go } = useActions()
  const dims = dimsOf(s.measure)
  const display: Display = s.display
  return (
    <Card className="gap-4 lg:sticky lg:top-16">
      <CardHeader><CardTitle role="heading" aria-level={2}>Query</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="measure">Measure</Label>
          <Select value={s.measure} onValueChange={(v) => { const m = v as MeasureKey, d = dimsOf(m); go({ measure: m, dimension: d.indexOf(s.dimension) >= 0 ? s.dimension : 'day', filters: {}, display: 'auto' }) }}>
            <SelectTrigger id="measure" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Visitors</SelectLabel>
                {VISITOR_MEASURES.map((m) => <SelectItem key={m} value={m}>{META.measures[m].label}</SelectItem>)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Events</SelectLabel>
                {measureKeys.filter((m) => VISITOR_MEASURES.indexOf(m) < 0).map((m) => <SelectItem key={m} value={m}>{META.measures[m].label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Unit: {META.measures[s.measure].unit}</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dimension">Break down by</Label>
          <Select value={s.dimension} onValueChange={(v) => go({ dimension: v as DimensionKey, display: s.display === 'line' && v !== 'day' ? 'auto' : s.display })}>
            <SelectTrigger id="dimension" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{dims.map((d) => <SelectItem key={d} value={d}>{META.dimensions[d]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span id="display-label" className="text-sm font-medium">Display</span>
          <ToggleGroup type="single" variant="outline" size="sm" value={display} onValueChange={(v) => v && go({ display: v as Display })} aria-labelledby="display-label" className="w-full">
            <ToggleGroupItem value="auto" className="flex-1">Auto</ToggleGroupItem>
            <ToggleGroupItem value="line" className="flex-1" disabled={s.dimension !== 'day'} title={s.dimension !== 'day' ? 'Line is for daily breakdowns' : undefined}>Line</ToggleGroupItem>
            <ToggleGroupItem value="bar" className="flex-1">Bar</ToggleGroupItem>
            <ToggleGroupItem value="table" className="flex-1">Table</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {Object.keys(s.filters).length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Explore filters</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(s.filters) as DimensionKey[]).map((k) => (
                <Chip key={k} text={META.dimensions[k] + ': ' + label(k, s.filters[k]!)} onRemove={() => { const f = { ...s.filters }; delete f[k]; go({ filters: f }) }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">These apply to Explore only. Overview keeps the shared date, country and device filters.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Only compatible fields are offered. Browser language is recorded on visits only. Changing the measure clears Explore filters. Previous-period comparison is on Overview.</p>
        <SavedViews s={s} setStatus={setStatus} />
      </CardContent>
    </Card>
  )
}

function readViews(): SavedView[] { try { return parseViews(localStorage.getItem(VIEWS_KEY)) } catch { return [] } }
function writeViews(v: SavedView[]): boolean { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); return true } catch { return false } }

function SavedViews({ s, setStatus }: { s: WorkspaceState; setStatus: (t: string) => void }) {
  const { go } = useActions()
  const [views, setViews] = useState(readViews)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const title = name.trim()
    if (!title) return
    const next = withView(readViews(), title, workspaceHash(s))
    if (writeViews(next)) { setViews(next); setStatus('Saved ' + title + '.') } else setStatus('This browser could not save the view. The address still keeps your selections.')
    setOpen(false)
  }
  const remove = (i: number) => {
    const next = views.filter((_, j) => j !== i)
    if (writeViews(next)) { setViews(next); setStatus('Saved view removed.') } else setStatus('This browser could not update saved views.')
  }
  return (
    <div className="border-t pt-4">
      <DropdownMenu onOpenChange={(o) => o && setViews(readViews())}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between"><span className="flex items-center gap-2"><BookmarkSimpleIcon aria-hidden />Saved views</span><CaretDownIcon className="opacity-60" aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={() => { setName(''); setOpen(true) }}>Save current view…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">{views.length ? 'In this browser (' + views.length + ' of 20)' : 'No saved views yet'}</DropdownMenuLabel>
          {views.map((v, i) => (
            <DropdownMenuSub key={v.name}>
              <DropdownMenuSubTrigger>{v.name}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => { go(workspaceState(v.hash, META)); setStatus('Opened ' + v.name + '.') }}>Open</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => remove(i)}><TrashIcon aria-hidden />Delete</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="mt-1.5 text-xs text-muted-foreground">Saved in this browser. The address also keeps the view.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Save this view</DialogTitle>
              <DialogDescription>Keeps the measure, breakdown, display, filters and date range. A view with the same name is replaced.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input id="view-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Collages by source, 30 days" autoFocus />
            </div>
            <DialogFooter><Button type="submit" disabled={!name.trim()}>Save view</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function download(data: WorkspaceData, s: WorkspaceState) {
  const blob = new Blob([workspaceCsv(data, s)], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url
  a.download = 'everybird-' + s.measure + '-' + data.range.from + '-' + data.range.to + '.csv'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Result({ snap }: { snap: Snapshot }) {
  const { go } = useActions()
  const { s, data, dataKey } = snap
  if (snap.error && !snap.stale) return <ErrorState message={snap.error} />
  if (!data || dataKey !== store.queryKey(s)) return <ExploreSkeleton />
  if (!data.coverage.available) return <NoCoverage first={data.coverage.first} />
  const x = data.explore, r = data.range
  const display = s.display === 'auto' ? (s.dimension === 'day' ? 'line' : 'bar') : s.display
  const measure = META.measures[s.measure], dimName = META.dimensions[s.dimension]
  const sentence = measure.label + ' by ' + dimName.charAt(0).toLowerCase() + dimName.slice(1) + ', ' + formatRange(r.from, r.to) + ', ' + (s.country ? countryName(s.country) : 'all countries') + ', ' + (s.device ? label('device', s.device) : 'all devices')
  const drill = (row: Row) => {
    if (row.key === '__other') return
    go({ filters: { ...s.filters, [s.dimension]: row.key } })
    requestAnimationFrame(() => document.getElementById('heading')?.focus({ preventScroll: true }))
  }
  const timeUnavailable = s.dimension === 'hour' && x.total > 0 && x.unknown === x.total
  const chartRows = workspaceChartRows(x)
  const today = pacificDay(Date.now())
  return (
    <Card className={cn('gap-4', snap.refreshing && 'opacity-60 transition-opacity')}>
      <CardHeader>
        <h2 className="text-sm font-medium">{sentence}</h2>
        <p className="text-[28px] leading-[1.1] font-medium tracking-[-0.025em] tabular-nums">{fmt(x.total)} <span className="text-sm font-normal text-muted-foreground">{x.unit}</span></p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground empty:hidden">
          {x.overlapping && <p>A visitor-day can appear in more than one category. Category values, including Other, must not be added to get the distinct total.</p>}
          {s.measure === 'active' && x.missingIdentity > 0 && <p>{fmt(x.missingIdentity)} events without a daily identity are excluded.</p>}
          {s.dimension === 'hour' && <p>{fmt(x.total - x.unknown)} events have receipt times; {fmt(x.unknown)} have no timestamp. Unknown times are left out of the chart and kept in the table.</p>}
          {s.dimension === 'language' && <p>{fmt(x.unknown)} visits have no recorded browser language. This is not the interface-language preference.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => download(data, s)}><DownloadSimpleIcon aria-hidden />Export CSV</Button>
          {display !== 'table' && <Button variant="ghost" size="sm" onClick={() => go({ display: 'table' })}><TableIcon aria-hidden />Show exact values</Button>}
        </div>
        {!x.total ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <h3 className="text-sm font-medium">{s.measure === 'active' && x.missingIdentity ? 'Daily identities unavailable' : 'No events in this range'}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a wider period or remove a filter. Missing timestamps and identities do not mean there was no activity.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => go({ preset: '30' })}>Previous 30 days</Button>
          </div>
        ) : (
          <>
            {timeUnavailable && display !== 'table' && <p className="text-sm text-muted-foreground">Hourly distribution unavailable: none of the matching events have timestamps. Use the table to inspect missing coverage.</p>}
            {display === 'line' && <DayChart rows={chartRows.map((c) => ({ day: c.key, value: c.value }))} mode="line" unit={x.unit} today={today} label={sentence + ': ' + fmt(x.total) + ' ' + x.unit + '. Exact values are in the table view.'} onPick={(day) => drill({ key: day, value: 0 })} />}
            {display === 'bar' && !timeUnavailable && (s.dimension === 'day' ? (
              chartRows.length > 60 ? (
                <>
                  <p className="text-xs text-muted-foreground">Long daily ranges use a line so dates stay readable. Use Table for exact daily values.</p>
                  <DayChart rows={chartRows.map((c) => ({ day: c.key, value: c.value }))} mode="line" unit={x.unit} today={today} label={sentence} onPick={(day) => drill({ key: day, value: 0 })} />
                </>
              ) : <DayChart rows={chartRows.map((c) => ({ day: c.key, value: c.value }))} mode="bar" unit={x.unit} today={today} label={sentence} onPick={(day) => drill({ key: day, value: 0 })} />
            ) : s.dimension === 'hour' ? <HourBars rows={chartRows} unit={x.unit} onPick={drill} /> : <CategoryBars rows={chartRows} dimension={s.dimension} unit={x.unit} onPick={drill} />)}
            {display === 'bar' && x.rows.length > 10 && s.dimension !== 'day' && s.dimension !== 'hour' && <p className="text-xs text-muted-foreground">Top 10 categories plus Other. The table and export include every category.</p>}
            {display === 'table' && <ResultTable data={data} s={s} onPick={drill} />}
            {s.dimension === 'hour' && display !== 'table' && x.unknown > 0 && <Button variant="link" size="sm" className="self-start p-0" onClick={() => go({ display: 'table' })}>Inspect events without timestamps in the table</Button>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryBars({ rows, dimension, unit, onPick }: { rows: Row[]; dimension: DimensionKey; unit: string; onPick: (r: Row) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ol className="flex flex-col gap-0.5" aria-label={'Top categories in ' + unit}>
      {rows.map((r) => {
        const name = label(dimension, r.key), other = r.key === '__other'
        return (
          <li key={r.key}>
            <button type="button" disabled={other} onClick={() => onPick(r)} aria-label={name + ': ' + fmt(r.value) + ' ' + unit + (other ? '' : '. Filter to ' + name + '.')}
              className="relative flex h-8 w-full items-center gap-3 overflow-hidden rounded-md px-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent">
              <span aria-hidden className={cn('absolute inset-y-0.5 left-0 rounded transition-[width] duration-300 motion-reduce:transition-none', other ? 'bg-muted' : 'bg-signal/14')} style={{ width: (r.value / max) * 100 + '%' }} />
              <span className="relative min-w-0 flex-1 truncate">{name}{dimension === 'country' && !other && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{r.key}</span>}</span>
              <span className="relative tabular-nums">{fmt(r.value)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const hourConfig = { value: { label: 'Value', color: 'var(--chart-1)' } } satisfies ChartConfig
function HourBars({ rows, unit, onPick }: { rows: Row[]; unit: string; onPick: (r: Row) => void }) {
  const reduced = useReducedMotion()
  const data = rows.map((r) => ({ ...r, hour: r.key.padStart(2, '0') }))
  return (
    <>
      <ChartContainer config={hourConfig} className="aspect-auto h-[240px] w-full" aria-hidden>
        <BarChart data={data} accessibilityLayer={false} className="cursor-pointer" onClick={(e) => { const i = Number(e?.activeTooltipIndex); if (Number.isInteger(i) && data[i]) onPick(data[i]) }}>
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={1} tickMargin={6} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={36} />
          <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={({ active, payload }) => {
            const p = active && payload?.[0] ? (payload[0].payload as (typeof data)[number]) : null
            return p ? <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-popover"><p className="font-medium">{p.hour}:00 Pacific: {fmt(p.value)} {unit}</p><p className="text-muted-foreground">Click to filter to this hour</p></div> : null
          }} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} isAnimationActive={!reduced} animationDuration={300} />
        </BarChart>
      </ChartContainer>
      <p className="sr-only">Hourly values are listed in the table view.</p>
    </>
  )
}

function ResultTable({ data, s, onPick }: { data: WorkspaceData; s: WorkspaceState; onPick: (r: Row) => void }) {
  const { go } = useActions()
  const [page, setPage] = useState(0)
  const x = data.explore
  const sorted = workspaceSort(x.rows, s.sort, s.descending, x.dimension)
  const pages = Math.max(1, Math.ceil(sorted.length / 50)), p = Math.min(page, pages - 1), start = p * 50
  const head = (col: 'key' | 'value', title: string) => {
    const active = s.sort === col
    return (
      <TableHead className={cn(col === 'value' && 'text-right')} aria-sort={active ? (s.descending ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className={cn('inline-flex items-center gap-1 font-medium hover:text-foreground', col === 'value' && 'flex-row-reverse')}
          onClick={() => go({ sort: col, descending: active ? !s.descending : col === 'value' })}>
          {title}
          {active ? (s.descending ? <CaretDownIcon size={12} aria-hidden /> : <CaretUpIcon size={12} aria-hidden />) : <span className="w-3" aria-hidden />}
          <span className="sr-only">, sort</span>
        </button>
      </TableHead>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border" tabIndex={0} role="region" aria-label="Exact values, scroll if needed">
        <Table>
          <caption className="sr-only">Exact values in {x.unit}, {sorted.length} rows</caption>
          <TableHeader className="bg-muted">
            <TableRow>{head('key', META.dimensions[x.dimension as DimensionKey])}{head('value', x.unit)}<TableHead><span className="sr-only">Drill down</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {sorted.slice(start, start + 50).map((r) => (
              <TableRow key={r.key}>
                <TableCell className={cn(x.dimension === 'day' || x.dimension === 'country' ? 'font-mono text-xs' : '')}>{x.dimension === 'day' ? r.key : label(x.dimension, r.key)}{x.dimension === 'country' && r.key && <span className="ml-2 font-sans text-sm">{countryName(r.key)}</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.value)}</TableCell>
                <TableCell className="text-right"><Button variant="link" size="sm" className="h-auto p-0" onClick={() => onPick(r)}>Filter to {label(x.dimension, r.key)}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow><TableCell>Total{x.overlapping ? ' (distinct, not a sum)' : ''}</TableCell><TableCell className="text-right font-medium tabular-nums">{fmt(x.total)}</TableCell><TableCell /></TableRow>
          </TableFooter>
        </Table>
      </div>
      {sorted.length > 50 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous rows</Button>
          <span>Rows {start + 1}-{Math.min(start + 50, sorted.length)} of {sorted.length}</span>
          <Button variant="outline" size="sm" disabled={start + 50 >= sorted.length} onClick={() => setPage(p + 1)}>Next rows</Button>
        </div>
      )}
    </div>
  )
}
