// The view kept across a language switch (src/lib/view-resume.ts): the round trip, the TTL, the version check, storage
// that throws, a normal load restoring nothing, and each slice taken once per page.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '@/lib/view-resume'

/** A Map-backed sessionStorage stand-in; `broken` makes every call throw, as blocked storage does. */
function fakeStore(broken = false) {
  const m = new Map<string, string>()
  const guard = () => {
    if (broken) throw new DOMException('blocked', 'SecurityError')
  }
  const store: Store & { m: Map<string, string> } = {
    m,
    getItem: (k) => (guard(), m.get(k) ?? null),
    setItem: (k, v) => (guard(), void m.set(k, v)),
    removeItem: (k) => (guard(), void m.delete(k)),
  }
  return store
}

const KEY = 'everybird:resume:v1'
const collage = {
  filter: { order: 'Passeriformes', countries: ['CA', 'EG'], continents: ['NA' as const], regions: ['latam' as const], statuses: ['VU' as const], basis: 'seen' as const, from: '2026-03', to: '2026-09' },
  mode: 'true' as const,
  view: 'list' as const,
  listOrder: 'lightest' as const,
  sci: true,
}
const slices = {
  collage,
  search: { open: true },
}

let mod: typeof import('@/lib/view-resume')

beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/lib/view-resume')
  mod.resetResumeForTests()
})

describe('writeResume / readResume', () => {
  it('round-trips the slices', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 1_000)
    const back = mod.readResume(store, 1_500)
    expect(back?.at).toBe(1_000)
    expect(back?.slices).toEqual(slices)
  })

  it('reads once: the record is removed', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 1_000)
    mod.readResume(store, 1_500)
    expect(store.m.has(KEY)).toBe(false)
    expect(mod.readResume(store, 1_500)).toBeNull()
  })

  it('expires after the TTL (60 s) and not before', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 0)
    expect(mod.readResume(store, mod.RESUME_TTL_MS)).not.toBeNull()
    mod.writeResume(store, slices, 0)
    expect(mod.readResume(store, mod.RESUME_TTL_MS + 1)).toBeNull()
  })

  it('ignores a record of another version, and removes it', () => {
    const store = fakeStore()
    store.m.set(KEY, JSON.stringify({ v: 2, at: 1_000, slices }))
    expect(mod.readResume(store, 1_100)).toBeNull()
    expect(store.m.has(KEY)).toBe(false)
  })

  it('ignores a record that is not JSON', () => {
    const store = fakeStore()
    store.m.set(KEY, '{nope')
    expect(mod.readResume(store, 1_000)).toBeNull()
  })

  it('does not throw when storage throws, and restores nothing', () => {
    const store = fakeStore(true)
    expect(() => mod.writeResume(store, slices, 1_000)).not.toThrow()
    expect(mod.readResume(store, 1_000)).toBeNull()
    expect(mod.readResume(null, 1_000)).toBeNull()
  })

  it('drops values it does not know and keeps the canonical ones', () => {
    const store = fakeStore()
    store.m.set(KEY, JSON.stringify({
      v: 1,
      at: 1_000,
      slices: {
        collage: { filter: { order: 'Owls', continents: ['NA', 'XX'], statuses: ['VU', 'ZZ'], basis: 'bogus', countries: 'CA', extra: 1 }, mode: 'odd', view: 'list', listOrder: 'heaviest', sci: false },
        search: { open: 'yes' },
        panel: { open: true, at: 'places' },
      },
    }))
    const back = mod.readResume(store, 1_000)!
    expect(back.slices.collage).toBeUndefined() // mode 'odd' is not a mode
    expect(back.slices.search).toBeUndefined() // open is not a boolean
    expect(back.slices.panel).toEqual({ open: true, at: 'places' })
  })

  it("reads the sort: a record from before the rename keeps its mass order, an unknown sort is the default", () => {
    const at = (c: Record<string, unknown>) => {
      const store = fakeStore()
      store.m.set(KEY, JSON.stringify({ v: 1, at: 1_000, slices: { collage: { filter: {}, mode: 'even', view: 'list', sci: false, ...c } } }))
      return mod.readResume(store, 1_000)!.slices.collage?.listOrder
    }
    expect(at({ massOrder: 'lightest' })).toBe('lightest')
    expect(at({ massOrder: 'heaviest' })).toBe('heaviest')
    expect(at({ listOrder: 'newest' })).toBe('newest')
    expect(at({ listOrder: 'family', massOrder: 'lightest' })).toBe('family')
    expect(at({ listOrder: 'alphabetical' })).toBe('newest')
    expect(at({})).toBe('newest')
  })

  it('keeps the Tree’s open marked branch: the genus and the groups with it', () => {
    const store = fakeStore()
    const filter = { order: 'Anseriformes', family: 'Anatidae', genus: 'Netta', with: ['Aythya'] }
    mod.writeResume(store, { collage: { ...collage, filter, view: 'tree' } }, 1_000)
    expect(mod.readResume(store, 1_000)!.slices.collage?.filter).toEqual(filter)
  })

  it('keeps valid region presets in collage filter and drops unknown ones', () => {
    const store = fakeStore()
    store.m.set(KEY, JSON.stringify({
      v: 1,
      at: 1_000,
      slices: {
        collage: { filter: { regions: ['me', 'mena', 'bogus'] }, mode: 'even', view: 'collage', listOrder: 'heaviest', sci: false },
      },
    }))
    const back = mod.readResume(store, 1_000)!
    expect(back.slices.collage?.filter).toEqual({ regions: ['me', 'mena'] })
  })
})

describe('stashResume', () => {
  it('writes what each owner offered, and leaves the panel out while the search is open', () => {
    const store = fakeStore()
    mod.offerResume('collage', () => collage)
    mod.offerResume('search', () => ({ open: true }))
    mod.offerResume('panel', () => ({ open: true, at: 'time' }))
    mod.stashResume(2_000, store)
    const back = mod.readResume(store, 2_000)!
    expect(back.slices.collage).toEqual(collage)
    expect(back.slices.search).toEqual({ open: true })
    expect(back.slices.panel).toBeUndefined()
  })

  it('an unmounted owner (its unregister ran) contributes nothing', () => {
    const store = fakeStore()
    const off = mod.offerResume('search', () => ({ open: false }))
    off()
    mod.stashResume(2_000, store)
    expect(mod.readResume(store, 2_000)!.slices.search).toBeUndefined()
  })

  it('a throwing owner leaves only its own slice out', () => {
    const store = fakeStore()
    mod.offerResume('collage', () => {
      throw new Error('boom')
    })
    mod.offerResume('search', () => ({ open: false }))
    expect(() => mod.stashResume(2_000, store)).not.toThrow()
    const back = mod.readResume(store, 2_000)!
    expect(back.slices.collage).toBeUndefined()
    expect(back.slices.search).toEqual({ open: false })
  })
})

describe('takeResume', () => {
  it('a normal load (no record) restores nothing', () => {
    const store = fakeStore()
    expect(mod.takeResume('collage', 5_000, store)).toBeUndefined()
    expect(mod.takeResume('search', 5_000, store)).toBeUndefined()
  })

  it('each slice goes to its first claimant only, once per page', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 1_000)
    expect(mod.takeResume('collage', 1_100, store)).toEqual(collage)
    expect(mod.takeResume('collage', 1_100, store)).toBeUndefined()
    expect(mod.takeResume('search', 1_100, store)).toEqual({ open: true })
    expect(mod.takeResume('search', 1_100, store)).toBeUndefined()
  })

  it('a claim after the TTL gets nothing, even when the record was read in time', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 1_000)
    expect(mod.takeResume('collage', 1_100, store)).toBeDefined()
    expect(mod.takeResume('search', 1_000 + mod.RESUME_TTL_MS + 1, store)).toBeUndefined()
  })

  it('a record older than the TTL on the first read is dropped', () => {
    const store = fakeStore()
    mod.writeResume(store, slices, 1_000)
    expect(mod.takeResume('collage', 1_000 + mod.RESUME_TTL_MS + 1, store)).toBeUndefined()
    expect(store.m.has(KEY)).toBe(false)
  })
})

describe('a language switch end to end (the helper)', () => {
  it('stash, then a fresh page takes it back', () => {
    const store = fakeStore()
    mod.offerResume('collage', () => collage)
    mod.stashResume(3_000, store)
    vi.resetModules()
    return import('@/lib/view-resume').then((fresh) => {
      expect(fresh.takeResume('collage', 3_200, store)).toEqual(collage)
    })
  })
})
