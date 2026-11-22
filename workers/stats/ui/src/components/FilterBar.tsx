import { CalendarBlankIcon, CaretDownIcon, CheckIcon, GlobeHemisphereWestIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActions } from '@/app/context'
import { META, store, type Snapshot } from '@/app/store'
import { PRESET_LABELS, countryName, formatRange, label } from '@/lib/format'
import { addDays, pacificDay } from '@/lib/pure'
import { cn } from '@/lib/utils'
import type { Preset } from '@/lib/workspace'

export const COMPARE_UNAVAILABLE = 'Comparison unavailable: the range includes today, the 16 Nov cutover, all dates, or a baseline before collection began.'

/** Whether Compare can apply to the current selection (the same rule as the first page). */
export function compareDisabled(snap: Snapshot): boolean {
  const { s, data, dataKey } = snap
  return s.preset === 'today' || s.preset === 'all' || (!!data && dataKey === store.queryKey(s) && !data.range.compareAvailable)
}

function RangePicker({ snap }: { snap: Snapshot }) {
  const { go } = useActions()
  const { s, data } = snap
  const [open, setOpen] = useState(false)
  const today = pacificDay(Date.now())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [problem, setProblem] = useState('')
  const onOpen = (o: boolean) => {
    if (o) {
      setFrom(s.preset === 'custom' ? s.from : data ? data.range.from : addDays(today, -14))
      setTo(s.preset === 'custom' ? s.to : data ? data.range.to : addDays(today, -1))
      setProblem('')
    }
    setOpen(o)
  }
  const pick = (preset: Preset) => { go({ preset }); setOpen(false) }
  const apply = (e: React.FormEvent) => {
    e.preventDefault()
    if (!from || !to) return setProblem('Choose both dates.')
    if (from > to) return setProblem('From must be on or before To.')
    if (to > today) return setProblem('Choose dates up to today.')
    go({ preset: 'custom', from, to })
    setOpen(false)
  }
  const triggerLabel = s.preset === 'custom' ? formatRange(s.from, s.to) : PRESET_LABELS[s.preset]
  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={'Date range: ' + triggerLabel}>
          <CalendarBlankIcon aria-hidden />
          {triggerLabel}
          <CaretDownIcon className="opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <div role="group" aria-label="Date range presets" className="flex flex-col">
          {(['today', '7', '14', '30', 'all'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={s.preset === p} onClick={() => pick(p)}
              className="flex h-8 items-center justify-between rounded-md px-2 text-left text-sm hover:bg-muted aria-pressed:font-medium">
              <span>{PRESET_LABELS[p]}{p === 'today' ? ' (incomplete)' : p === 'all' ? ' (up to 10 years)' : ''}</span>
              {s.preset === p && <CheckIcon aria-hidden />}
            </button>
          ))}
        </div>
        <form onSubmit={apply} className="mt-1 border-t p-2" aria-label="Custom range">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Custom range (Pacific days)</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1"><Label htmlFor="range-from" className="text-xs">From</Label><Input id="range-from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="h-8 font-mono text-xs" required /></div>
            <div className="grid gap-1"><Label htmlFor="range-to" className="text-xs">To</Label><Input id="range-to" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 font-mono text-xs" required /></div>
          </div>
          {problem && <p className="mt-2 text-xs text-negative" role="alert">{problem}</p>}
          <Button type="submit" size="sm" className="mt-2 w-full">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function CountryPicker({ snap }: { snap: Snapshot }) {
  const { go } = useActions()
  const [open, setOpen] = useState(false)
  const { s, data } = snap
  const keys = data ? data.countryOptions.slice() : []
  if (s.country && keys.indexOf(s.country) < 0) keys.push(s.country)
  keys.sort((a, b) => countryName(a).localeCompare(countryName(b)))
  const pick = (k: string) => { go({ country: k }); setOpen(false) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label={'Request location: ' + (s.country ? countryName(s.country) : 'all countries')}>
          <GlobeHemisphereWestIcon aria-hidden />
          {s.country ? countryName(s.country) : 'Country'}
          <CaretDownIcon className="opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Find a country" aria-label="Find a country" />
          <CommandList>
            <CommandEmpty>No country recorded in this range.</CommandEmpty>
            <CommandGroup heading="Request locations in this range">
              <CommandItem value="all countries" onSelect={() => pick('')}>
                <span className="flex-1">All countries</span>
                <span className="flex w-6 justify-end">{!s.country && <CheckIcon aria-label="Selected" className="text-foreground" />}</span>
              </CommandItem>
              {keys.map((k) => (
                <CommandItem key={k} value={countryName(k) + ' ' + k} onSelect={() => pick(k)}>
                  <span className="flex-1 truncate">{countryName(k)}</span>
                  {/* The code's slot holds the tick once this country is the filter, so the column never shifts. */}
                  <span className="flex w-6 justify-end font-mono text-xs text-muted-foreground">
                    {s.country === k ? <><CheckIcon aria-hidden className="text-foreground" /><span className="sr-only">{k}, selected</span></> : k}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-input bg-muted pr-1 pl-3 text-xs font-medium text-foreground">
      {text}
      <button type="button" onClick={onRemove} aria-label={'Remove ' + text} className="grid size-5 place-items-center rounded-full hover:bg-background/60">
        <XIcon size={12} aria-hidden />
      </button>
    </span>
  )
}
export { Chip }

export function FilterBar({ snap }: { snap: Snapshot }) {
  const { go } = useActions()
  const { s } = snap
  const disabled = compareDisabled(snap)
  const sw = (
    <div className="flex items-center gap-2">
      <Switch id="compare" checked={s.compare && !disabled} disabled={disabled} onCheckedChange={(v) => go({ compare: v })} />
      <Label htmlFor="compare" className={cn('text-sm font-normal', disabled && 'text-muted-foreground')}>Compare to previous period</Label>
    </div>
  )
  const filtered = s.country || s.device || s.preset !== '14' || Object.keys(s.filters).length > 0
  return (
    <div role="region" aria-label="Shared filters" className="sticky top-14 z-20 -mx-4 mb-4 border-b border-hairline bg-background/95 px-4 py-2 backdrop-blur-sm min-[900px]:top-0 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <RangePicker snap={snap} />
        <CountryPicker snap={snap} />
        <Select value={s.device || 'all'} onValueChange={(v) => go({ device: v === 'all' ? '' : v })}>
          <SelectTrigger size="sm" aria-label="Device class" className="rounded-full bg-card">
            <SelectValue placeholder="Device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            {META.devices.map((d) => <SelectItem key={d} value={d}>{label('device', d)}</SelectItem>)}
          </SelectContent>
        </Select>
        {s.view === 'overview' && (disabled ? (
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0} className="rounded-md">{sw}</span></TooltipTrigger>
            <TooltipContent className="max-w-xs">{COMPARE_UNAVAILABLE}</TooltipContent>
          </Tooltip>
        ) : sw)}
        {(s.country || s.device) && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
        {s.country && <Chip text={'Country: ' + countryName(s.country)} onRemove={() => go({ country: '' })} />}
        {s.device && <Chip text={'Device: ' + label('device', s.device)} onRemove={() => go({ device: '' })} />}
        {filtered && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => go({ preset: '14', from: '', to: '', country: '', device: '', filters: {}, compare: true })}>Reset</Button>
        )}
      </div>
    </div>
  )
}
