// The console's one store: the URL-hash state, the last result and the request lifecycle. Same rules as the first page:
// every navigation takes a ticket (stale answers are dropped, superseded requests aborted), a 20 s timeout, the cached
// result reused when the query is unchanged, a quiet refresh skipped while one is pending, and every fetch with no-store.
import { useSyncExternalStore } from 'react'
import { WORKSPACE_META } from '../../../src/workspace'
import { pacificDay } from '@/lib/pure'
import { workspaceHash, workspaceQuery, workspaceRequestGate, workspaceState, type WorkspaceData, type WorkspaceState } from '@/lib/workspace'

export const META = WORKSPACE_META

export type Snapshot = {
  s: WorkspaceState
  data: WorkspaceData | null
  dataKey: string
  /** The current selection is loading and nothing for it is shown yet. */
  loading: boolean
  /** The shown result is being refreshed (same selection). */
  refreshing: boolean
  /** A failure for the current selection; with stale, the last result is still shown. */
  error: string | null
  stale: boolean
  /** Cloudflare Access no longer lets the data through. */
  expired: boolean
  /** When the shown result arrived (browser clock). */
  receivedAt: number
}

const today = () => pacificDay(Date.now())
const EXPIRED = 'expired'

class Store {
  private snap: Snapshot
  private listeners = new Set<() => void>()
  private gate = workspaceRequestGate()
  private pending: AbortController | null = null

  constructor() {
    this.snap = { s: workspaceState(location.hash, META), data: null, dataKey: '', loading: true, refreshing: false, error: null, stale: false, expired: false, receivedAt: 0 }
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  get = () => this.snap
  private set(patch: Partial<Snapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach((fn) => fn()) }

  queryKey(s = this.snap.s) { return workspaceQuery(s, today()) }

  /** Apply a patch to the state (normalized), push it to the URL, and load. */
  change = (patch: Partial<WorkspaceState>) => {
    const s = workspaceState(workspaceHash({ ...this.snap.s, ...patch }), META)
    const hash = workspaceHash(s)
    if (location.hash !== hash && !(hash === '' && location.hash === '')) history.pushState(null, '', location.pathname + location.search + hash)
    this.set({ s })
    void this.load(false)
  }
  /** Back/forward and hand-edited hashes. */
  restore = () => { this.set({ s: workspaceState(location.hash, META) }); void this.load(false) }

  load = async (quiet: boolean) => {
    if (quiet && this.pending) return
    const id = this.gate.begin()
    if (this.pending) { this.pending.abort(); this.pending = null }
    const s = this.snap.s
    if (s.view === 'definitions') { this.set({ loading: false, refreshing: false }); return }
    const key = this.queryKey(s), { data, dataKey } = this.snap
    if (!quiet && data && key === dataKey) { this.set({ loading: false, refreshing: false, error: null, stale: false }); return }
    const controller = new AbortController()
    this.pending = controller
    const timeout = setTimeout(() => controller.abort(), 20000)
    const same = !!data && key === dataKey
    this.set({ loading: !same, refreshing: same, ...(same ? {} : { error: null, stale: false }) })
    try {
      const res = await fetch('/dashboard/data?' + key, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } })
      if (!this.gate.current(id)) return
      if (res.status === 400) {
        const problem = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error((problem.error || 'Invalid analytics query.') + ' Use Reset or choose a compatible view.')
      }
      if (res.status === 404 || res.status === 401 || res.status === 403) throw new Error(EXPIRED)
      if (!res.ok) throw new Error('Analytics could not be loaded (HTTP ' + res.status + '). Try again shortly.')
      if ((res.headers.get('content-type') || '').indexOf('application/json') < 0) throw new Error(EXPIRED)
      const result = (await res.json()) as WorkspaceData
      if (!this.gate.current(id)) return
      this.set({ data: result, dataKey: key, error: null, stale: false, expired: false, receivedAt: Date.now() })
    } catch (err) {
      if (!this.gate.current(id)) return
      const e = err as Error
      if (e.message === EXPIRED) { this.set({ expired: true }); return }
      const message = e.name === 'AbortError' ? 'The request timed out after 20 s.' : e.name === 'TypeError' ? 'The network request failed.' : e.message
      this.set({ error: message, stale: same })
    } finally {
      clearTimeout(timeout)
      if (this.gate.current(id)) { this.pending = null; this.set({ loading: false, refreshing: false }) }
    }
  }
}

export const store = new Store()
export const useStore = () => useSyncExternalStore(store.subscribe, store.get)
