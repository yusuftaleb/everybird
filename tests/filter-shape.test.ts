import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createLayoutHandler, type MaskTable, type WorkerReply, type ListEntryMsg, type LayoutName } from '../src/lib/layout/layout.worker'

// A filtered collage takes a shape for the page, not the full collage's band (round 6: Free with Shorebirds and gulls,
// 232 of 5,235 species, came out as one column four times taller than wide down a wide page). Public reference data only.
const DATA = resolve(__dirname, '../public/data')
// Big enough that every layout's full collage grows several times taller than its starting stage.
const LIST = 3000
let ENTRIES: ListEntryMsg[] = []
const TABLES: Record<string, MaskTable> = {}

beforeAll(() => {
  for (const f of readdirSync(resolve(DATA, 'masks')).sort()) TABLES[f.split('.')[0]] = JSON.parse(readFileSync(resolve(DATA, 'masks', f), 'utf8'))
  const all = (JSON.parse(readFileSync(resolve(DATA, 'species.v1.json'), 'utf8')).species as { code: string; g: number; ord: string }[])
    .filter((s) => TABLES[s.ord]?.[s.code])
  const n = LIST, step = all.length / n
  ENTRIES = Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]).map((s) => ({ code: s.code, mass: s.g, ord: s.ord }))
})

type Result = Extract<WorkerReply, { type: 'result' }>
/** The content's bounding box: its aspect (height / width) and the share of the stage's width it spans. */
function shape(r: Result) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < r.codes.length; i++) {
    const [x, y, w, h] = r.boxes.subarray(4 * i, 4 * i + 4)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h)
  }
  return { tall: (y1 - y0) / (x1 - x0), width: (x1 - x0) / r.W }
}

async function states(layout: LayoutName, arr: 'packed' | 'free' | 'oval', subsets: string[][]) {
  const handle = createLayoutHandler(async (o) => TABLES[o] ?? {})
  await handle({ type: 'setList', id: 0, entries: ENTRIES })
  const flag = arr === 'oval' ? { oval: true } : arr === 'free' ? { free: true } : {}
  const full = (await handle({ type: 'layout', id: 1, key: 'full', codes: ENTRIES.map((e) => e.code), layout, mode: 'even', ...flag })) as Result
  const out = []
  for (const codes of subsets) {
    const r = (await handle({ type: 'layout', id: 2, key: 'f', codes, layout, mode: 'even', refBase: full.base, fixedStage: [full.W, full.H], fit: true, ...flag })) as Result
    // The same birds as a list of their own, in Fit: the page's shape for that many birds.
    const own = (await handle({ type: 'layout', id: 3, key: 'own', codes, layout, mode: 'even' })) as Result
    out.push({ n: codes.length, ...shape(r), own: shape(own).tall })
  }
  return { full: shape(full), out }
}

// Before the fix: one order of a big list (182 of 5,235) packed 3.2x (Fit, Free) to 4.0x (Oval) taller than wide on
// the wide layout at 38% of the stage's width, 7x on medium, 17x on narrow (the same birds as a list of their own: 0.63,
// 1.14, 2.6): the full collage's own column. Now a taxon takes its own list's shape within about 10%, and a big share of
// the list grows towards the full collage's shape only while it spans the page.
describe('a filtered collage uses the page', () => {
  const ord = (o: string) => ENTRIES.filter((e) => e.ord === o).map((e) => e.code)
  const every = (k: number) => ENTRIES.filter((_, i) => i % k === 0).map((e) => e.code)
  for (const name of ['wide', 'medium', 'narrow'] as LayoutName[]) {
    for (const arr of ['free', 'packed', 'oval'] as const) {
      it(`${name}, ${arr === 'packed' ? 'Fit' : arr}: a taxon keeps the page's shape, not the full collage's column`, async () => {
        const subsets = [ord('Charadriiformes'), every(25), every(2)]
        const { full, out } = await states(name, arr, subsets)
        expect(full.tall).toBeGreaterThan(2) // the full collage grew taller than wide: the case that went wrong
        for (const o of out) {
          const at = `${o.n} birds: ${o.tall.toFixed(2)} tall, its own list ${o.own.toFixed(2)}, ${o.width.toFixed(2)} of the width`
          expect(o.tall, at).toBeLessThanOrEqual(full.tall * 1.02)
          // A taxon (a tenth of the list or less) takes the shape Fit gives those birds as a list of their own.
          if (o.n <= LIST / 10) {
            expect(o.tall / o.own, at).toBeGreaterThan(0.85)
            expect(o.tall / o.own, at).toBeLessThan(1.15)
          }
          // Taller than its own list's shape only while it spans the page: never a band down the middle.
          if (o.tall > 1.5 * o.own) expect(o.width, at).toBeGreaterThan(0.95)
        }
      }, 120_000)
    }
  }
})
