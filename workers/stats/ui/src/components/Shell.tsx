import { BookOpenIcon, ChartLineIcon, CompassIcon, ListIcon, MagnifyingGlassIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { useState, type ComponentType } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useActions } from '@/app/context'
import type { Snapshot } from '@/app/store'
import { pacificTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { View } from '@/lib/workspace'

const NAV: { view: View; label: string; Icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }> }[] = [
  { view: 'overview', label: 'Overview', Icon: ChartLineIcon },
  { view: 'explore', label: 'Explore', Icon: CompassIcon },
  { view: 'definitions', label: 'Definitions', Icon: BookOpenIcon },
]
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const SHORTCUT = isMac ? '⌘K' : 'Ctrl K'

function Wordmark() {
  return (
    <div className="flex items-baseline gap-1.5 px-2">
      <span className="text-[15px] font-medium tracking-[-0.025em]">Everybird</span>
      <span className="text-sm text-muted-foreground">stats</span>
    </div>
  )
}

function NavRows({ view, onPick }: { view: View; onPick?: () => void }) {
  const { go } = useActions()
  return (
    <nav aria-label="Dashboard views" className="flex flex-col gap-0.5">
      {NAV.map(({ view: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-current={view === v ? 'page' : undefined}
          onClick={() => { go({ view: v }); onPick?.(); requestAnimationFrame(() => document.getElementById('heading')?.focus({ preventScroll: true })) }}
          className={cn('relative flex h-9 items-center gap-2.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            view === v && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground')}
        >
          {view === v && <span aria-hidden className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-signal" />}
          <Icon size={20} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  )
}

function Footer({ snap, autoRefresh }: { snap: Snapshot; autoRefresh: string }) {
  const { dark, toggleTheme, openPalette } = useActions()
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={openPalette} className="flex h-9 items-center gap-2.5 rounded-full border border-input bg-card px-3 text-sm text-muted-foreground hover:text-foreground">
        <MagnifyingGlassIcon size={20} aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">{SHORTCUT}</kbd>
      </button>
      <div className="border-t pt-3 text-xs leading-4 text-muted-foreground">
        <p>{snap.data ? 'Data from ' + pacificTime(snap.data.generatedAt) + ' Pacific' : 'No data loaded yet'}</p>
        <p className="mt-0.5">{autoRefresh}</p>
      </div>
      <Button variant="ghost" size="sm" className="justify-start gap-2.5 px-2 text-muted-foreground" onClick={toggleTheme} aria-label={'Switch to ' + (dark ? 'light' : 'dark') + ' theme'}>
        {dark ? <SunIcon size={20} aria-hidden /> : <MoonIcon size={20} aria-hidden />}
        {dark ? 'Light theme' : 'Dark theme'}
      </Button>
    </div>
  )
}

export function Sidebar({ view, snap, autoRefresh }: { view: View; snap: Snapshot; autoRefresh: string }) {
  return (
    <aside aria-label="Analytics navigation" className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-6 border-r bg-sidebar p-3 pt-5 min-[900px]:flex">
      <Wordmark />
      <NavRows view={view} />
      <div className="flex-1" />
      <Footer snap={snap} autoRefresh={autoRefresh} />
    </aside>
  )
}

export function MobileBar({ view, snap, autoRefresh }: { view: View; snap: Snapshot; autoRefresh: string }) {
  const [open, setOpen] = useState(false)
  const { openPalette } = useActions()
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-sidebar px-2 min-[900px]:hidden">
      <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><ListIcon size={20} aria-hidden /></Button>
      <Wordmark />
      <div className="flex-1" />
      <Button variant="ghost" size="icon" aria-label="Search" onClick={openPalette}><MagnifyingGlassIcon size={20} aria-hidden /></Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[260px] gap-6 p-3 pt-5">
          <SheetHeader className="p-0">
            <SheetTitle className="px-2">Everybird stats</SheetTitle>
            <SheetDescription className="sr-only">Views and settings</SheetDescription>
          </SheetHeader>
          <NavRows view={view} onPick={() => setOpen(false)} />
          <div className="flex-1" />
          <Footer snap={snap} autoRefresh={autoRefresh} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
