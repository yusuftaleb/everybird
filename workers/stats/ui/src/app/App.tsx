import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommandPalette } from '@/components/CommandPalette'
import { FilterBar } from '@/components/FilterBar'
import { MobileBar, Sidebar } from '@/components/Shell'
import { TitleRow } from '@/components/TitleRow'
import { AccessExpired } from '@/components/States'
import { Definitions } from '@/views/Definitions'
import { Explore } from '@/views/Explore'
import { Overview } from '@/views/Overview'
import type { WorkspaceState } from '@/lib/workspace'
import { ActionsContext, type Actions } from './context'
import { useTheme } from './hooks'
import { store, useStore } from './store'

export function App() {
  const snap = useStore()
  const { s } = snap
  const [dark, toggleTheme] = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const results = useRef<HTMLDivElement>(null)
  const focusWasInside = useRef(false)
  const [resultsFocused, setResultsFocused] = useState(false)

  const go = useCallback((patch: Partial<WorkspaceState>) => {
    focusWasInside.current = !!results.current?.contains(document.activeElement)
    store.change(patch)
  }, [])
  const focusHeading = () => requestAnimationFrame(() => document.getElementById('heading')?.focus({ preventScroll: true }))
  const actions = useMemo<Actions>(() => ({
    go,
    explore: (measure, dimension = 'day', filters = {}) => { go({ view: 'explore', measure, dimension, filters, display: 'auto', sort: 'key', descending: false }); focusHeading() },
    refresh: () => { void store.load(true) },
    openPalette: () => setPaletteOpen(true),
    dark, toggleTheme,
  }), [go, dark, toggleTheme])

  // First load, back/forward, background refresh every 60 s while visible (not on Definitions, not while focus is in the results).
  useEffect(() => {
    void store.load(false)
    const restore = () => store.restore()
    addEventListener('popstate', restore)
    addEventListener('hashchange', restore)
    const timer = setInterval(() => {
      const st = store.get().s
      if (!document.hidden && st.view !== 'definitions' && !results.current?.contains(document.activeElement)) void store.load(true)
    }, 60000)
    const visible = () => { if (!document.hidden && store.get().s.view !== 'definitions') void store.load(true) }
    document.addEventListener('visibilitychange', visible)
    return () => { removeEventListener('popstate', restore); removeEventListener('hashchange', restore); clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [])

  // Cmd/Ctrl+K and "/" open the command palette ("/" only outside text fields).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setPaletteOpen(true) }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])

  // When a new selection replaced the element that had focus, put focus on the page heading instead of the body.
  useEffect(() => {
    if (snap.loading || !focusWasInside.current) return
    const a = document.activeElement
    if (!a || a === document.body || !a.isConnected) document.getElementById('heading')?.focus({ preventScroll: true })
    focusWasInside.current = false
  }, [snap.loading, snap.data])

  const autoRefresh = s.view === 'definitions' ? 'Auto-refresh off on Definitions' : resultsFocused ? 'Auto-refresh paused while you work' : 'Auto-refresh every 60 s'

  return (
    <ActionsContext.Provider value={actions}>
      <TooltipProvider delayDuration={200}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to analytics</a>
        <div className="flex min-h-dvh">
          <Sidebar view={s.view} snap={snap} autoRefresh={autoRefresh} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileBar view={s.view} snap={snap} autoRefresh={autoRefresh} />
            <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-[1440px] flex-1 px-4 pb-12 outline-none sm:px-6">
              {(snap.refreshing || (snap.loading && !!snap.data)) && <div className="progress-bar" role="progressbar" aria-label="Loading data" />}
              {snap.expired ? <AccessExpired /> : (
                <>
                  <TitleRow snap={snap} />
                  {s.view !== 'definitions' && <FilterBar snap={snap} />}
                  <div
                    ref={results}
                    id="results"
                    aria-busy={snap.loading}
                    onFocus={() => setResultsFocused(true)}
                    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setResultsFocused(false) }}
                  >
                    {s.view === 'overview' && <Overview snap={snap} />}
                    {s.view === 'explore' && <Explore snap={snap} />}
                    {s.view === 'definitions' && <Definitions />}
                  </div>
                  <p className="mt-10 text-xs text-muted-foreground">
                    Pacific time · anonymous recorded activity · blockers and privacy preferences reduce coverage.{' '}
                    {s.view !== 'definitions' && <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => { go({ view: 'definitions' }); focusHeading() }}>How these numbers are counted</button>}
                  </p>
                </>
              )}
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} snap={snap} />
      </TooltipProvider>
    </ActionsContext.Provider>
  )
}
