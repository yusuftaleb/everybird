import { ArrowClockwiseIcon, BookOpenIcon, CalendarBlankIcon, ChartLineIcon, CompassIcon, GlobeHemisphereWestIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { useActions } from '@/app/context'
import type { Snapshot } from '@/app/store'
import { PRESET_LABELS, TREND_INFO, countryName } from '@/lib/format'
import { TRENDS, type WorkspaceState } from '@/lib/workspace'

/** Cmd/Ctrl+K (or "/"): jump to a view, a range, a metric or a country; toggle the theme; refresh. */
export function CommandPalette({ open, onOpenChange, snap }: { open: boolean; onOpenChange: (o: boolean) => void; snap: Snapshot }) {
  const { go, refresh, dark, toggleTheme } = useActions()
  const run = (fn: () => void) => () => { onOpenChange(false); fn() }
  const to = (patch: Partial<WorkspaceState>) => run(() => go(patch))
  const countries = (snap.data?.countryOptions ?? []).slice().sort((a, b) => countryName(a).localeCompare(countryName(b)))
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump to a view, range, metric or country">
      <CommandInput placeholder="Type a view, range, metric or country" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={to({ view: 'overview' })}><ChartLineIcon aria-hidden />Overview</CommandItem>
          <CommandItem onSelect={to({ view: 'explore' })}><CompassIcon aria-hidden />Explore</CommandItem>
          <CommandItem onSelect={to({ view: 'definitions' })}><BookOpenIcon aria-hidden />Definitions</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Range">
          {(['today', '7', '14', '30', 'all'] as const).map((p) => (
            <CommandItem key={p} value={'range ' + PRESET_LABELS[p]} onSelect={to({ preset: p })}><CalendarBlankIcon aria-hidden />{PRESET_LABELS[p]}</CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Metric">
          {TRENDS.map((m) => (
            <CommandItem key={m} value={'metric ' + TREND_INFO[m].label} onSelect={to({ view: 'overview', trend: m })}><ChartLineIcon aria-hidden />{TREND_INFO[m].label}</CommandItem>
          ))}
        </CommandGroup>
        {countries.length > 0 && (
          <CommandGroup heading="Country">
            <CommandItem value="country all countries" onSelect={to({ country: '' })}><GlobeHemisphereWestIcon aria-hidden />All countries</CommandItem>
            {countries.map((k) => (
              <CommandItem key={k} value={'country ' + countryName(k) + ' ' + k} onSelect={to({ country: k })}>
                <GlobeHemisphereWestIcon aria-hidden />{countryName(k)}<CommandShortcut className="font-mono">{k}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(toggleTheme)}>{dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}{dark ? 'Light theme' : 'Dark theme'}</CommandItem>
          <CommandItem onSelect={run(refresh)}><ArrowClockwiseIcon aria-hidden />Refresh data</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
