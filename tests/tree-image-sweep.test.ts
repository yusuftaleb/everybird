// The Tree image, swept (round 6, item 16, the maintainer: "I keep finding such problems"): every arrangement (Fan,
// Radial, Rectangular) on every card it is drawn on (the Fan horizontal: Desktop, the 5:4 post, Square; the others
// vertical: Story, Post, Square), with the time scale on and off, every total or none, at a level of 5, 27 and 141 tips
// of the shipped tree (Gamebirds' families, Cuckoos' genera, Perching birds' families), in English and German. Drawn
// from the real renderer through a recording canvas that measures text with the stored glyph advances
// (tests/fixtures/tree-image-harness.ts), each image is checked for: no text over other text, every tip's name and
// count, the axis's numbers clear of each other, the branches and the labels, the axis present with the time scale
// on, and no empty band taller than a tenth of the card between the head and the footer.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fmt } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { en } from '@/i18n/messages/en'
import { de } from '@/i18n/messages/de'
import type { CardFormat, ShareImageOpts } from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import { familyName, setNames } from '@/lib/species/names'
import type { SpeciesRow } from '@/lib/species/types'
import { levelView, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { formatAge, oldestLineage, parseNewick } from '@/lib/tree/tree'
import { INLINE_ROW } from '@/lib/share/image'
import { inQuad, largestGap, quadsOverlap, shrink, yRange, type Drawn, type Pt } from './fixtures/tree-image-harness'

const file = JSON.parse(readFileSync('public/data/tree.v1.json', 'utf8'))
const shipped = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const tree = parseNewick(file.newick, file.taxOnly)
const species = buildSpeciesIndex(shipped.species)
const deNames = JSON.parse(readFileSync('public/data/names.de.v1.json', 'utf8'))
// A list: every third species.
const codes = new Set(shipped.species.filter((_, i) => i % 3 === 0).map((r) => r.code))
const entries = [...codes].map((code) => ({ code, date: '2020-01', place: { country: 'CA' } }))

vi.mock('@/lib/tree/load', () => ({ loadTree: async () => ({ tree: (globalThis as { __tree?: unknown }).__tree }) }))
vi.mock('@/lib/species/load', async (orig) => ({ ...(await orig<typeof import('@/lib/species/load')>()), loadSpecies: async () => (globalThis as { __species?: unknown }).__species }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), loadStickers: async (urls: string[]) => new Map(urls.map((u) => [u, {}])) }))
const frame = vi.hoisted(() => ({ last: null as null | { rec: ReturnType<typeof import('./fixtures/tree-image-harness').recorder>; L: { W: number; H: number; collage: { x: number; y: number; w: number; h: number } }; latestAs: boolean; row: string } }))
vi.mock('@/lib/share/view-image', async (orig) => {
  const real = await orig<typeof import('@/lib/share/view-image')>()
  const { cardLayout, paintRow } = await import('@/lib/share/image')
  const h = await import('./fixtures/tree-image-harness')
  return {
    ...real,
    renderViewImage: async (opts: ShareImageOpts & { latestAs?: { row: { com: string }; label: string; detail?: string } }, _footer: string, paint: (ctx: CanvasRenderingContext2D, card: unknown, area: unknown) => void) => {
      const L = cardLayout(opts.format, { name: false, filter: false, latest: !!opts.latestAs, count: 0, countSize: 'hide' })
      const rec = h.recorder()
      const card = { L, colors: { ink: '#000', line: '#999', muted: '#666', paper: '#fff', hairline: '#ddd', accent: '#c00', surface: '#eee' }, fonts: h.FONTS, transparent: false }
      paint(rec.ctx, card, { ...L.collage })
      // The frame's row, by the frame's own painter (image.ts paintRow), its sticker its square.
      let row = ''
      if (opts.latestAs && L.latest) {
        rec.ctx.drawImage({} as CanvasImageSource, L.latest.x, L.latest.y, L.latest.icon, L.latest.icon)
        row = paintRow(rec.ctx, h.FONTS, card.colors, L.latest, { label: opts.latestAs.label, name: opts.latestAs.row.com, ...(opts.latestAs.detail ? { detail: opts.latestAs.detail } : {}) })
      }
      frame.last = { rec, L, latestAs: !!opts.latestAs, row }
      return new Blob(['tree'])
    },
  }
})
const { renderTreeImage } = await import('@/lib/share/tree-image')

beforeAll(() => {
  (globalThis as { __tree?: unknown }).__tree = tree;
  (globalThis as { __species?: unknown }).__species = species;
  (globalThis as { Path2D?: unknown }).Path2D = class { constructor(public d?: string) {} }
})

type Layout = 'fan' | 'circle' | 'rows'
const CARDS: Record<Layout, CardFormat[]> = { fan: ['desktop', 'wide', 'square'], circle: ['story', 'post', 'square'], rows: ['story', 'post', 'square'] }
const LEVELS: { name: string; level: TreeLevel }[] = [{ name: '5 families', level: { ord: 'Galliformes' } }, { name: '27 genera', level: { ord: 'Cuculiformes' } }, { name: '141 families', level: { ord: 'Passeriformes' } }]
const LANGS = { en, de }

type Tip = Exclude<TreeRow, { kind: 'order' }>
/** What one render drew, and what it should have. */
async function render(o: { layout: Layout; format: CardFormat; time: boolean; totals: boolean; level: TreeLevel; lang: 'en' | 'de' }) {
  const t = LANGS[o.lang].ui
  setNames(o.lang === 'de' ? deNames : null)
  const fits: Record<string, unknown>[] = []
  await renderTreeImage({
    format: o.format, entries, species, theme: 'light', strings: t, latest: false,
    at: { tree: o.level, layout: o.layout, time: o.time }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t,
    totals: o.totals ? undefined : [], oldest: true, onTreeFits: (f: Record<string, unknown>) => fits.push(f),
  } as unknown as Parameters<typeof renderTreeImage>[0])
  const v = levelView(tree, species, o.level, codes)!
  const tips = v.rows.filter((r): r is Tip => r.kind !== 'order')
  const nameOf = (r: Tip) => (r.kind === 'species' ? r.row.com : v.tips === 'genera' ? r.key : v.tips === 'orders' ? (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord : familyName(r.row))
  const countOf = (r: Tip) => (r.kind === 'group' ? fmt(t.collage.tree.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')
  const ages = new Set(Array.from({ length: 400 }, (_, i) => formatAge(i * 5, t.num)).concat(Array.from({ length: 400 }, (_, i) => formatAge(i, t.num))))
  // Drawn round: the layout asked for is a Fan or Radial the image could name every tip in (else it drew rows).
  const last = fits.at(-1) as Record<string, Record<string, boolean>> | undefined
  const card = last?.[o.format] ?? (last as unknown as Record<string, boolean> | undefined)
  const round = o.layout !== 'rows' && !!(card as Record<string, boolean> | undefined)?.[o.layout]
  // The oldest lineage (Show oldest lineage is on): one line, name first, on Desktop, Post and Square.
  const old = oldestLineage(tree, codes)!
  const oldest = { name: species.byCode.get(old.code)!.com, forms: [t.collage.tree.oldestDetail, t.collage.tree.oldestLabel].map((f) => fmt(f, { age: formatAge(old.age, t.num) })), oneLine: INLINE_ROW.has(o.format) }
  return { ...frame.last!, t, tips, names: tips.map(nameOf), counts: tips.map(countOf), ages, fits: fits.at(-1), round, oldest }
}

/** Every problem in one render, in words. */
function problems(r: Awaited<ReturnType<typeof render>>, time: boolean): string[] {
  const out: string[] = []
  const { texts, images, strokes, rects } = r.rec
  const drawn = texts.map((x) => x.s)
  // Every tip's name and count, whole.
  const missingNames = r.names.filter((n) => !drawn.includes(n))
  if (missingNames.length) out.push(`${missingNames.length} names missing or cut (${missingNames.slice(0, 3).join(', ')})`)
  const missingCounts = r.counts.filter((c, i) => c && !drawn.includes(c) && r.names[i])
  const countsWanted = r.counts.filter(Boolean).length
  const countsDrawn = texts.filter((x) => /\d/.test(x.s) && r.counts.includes(x.s)).length
  if (missingCounts.length || countsDrawn < countsWanted) out.push(`${countsWanted - countsDrawn} counts missing`)
  // The oldest lineage row (the frame's paintRow): the whole name, and on one line the detail or its short form, whole.
  if (!r.latestAs) out.push('oldest lineage missing')
  else {
    if (!drawn.includes(r.oldest.name)) out.push('oldest lineage name missing or cut')
    if (r.oldest.oneLine && !r.oldest.forms.includes(r.row)) out.push(`oldest lineage detail missing or cut ("${r.row}")`)
  }
  // No text over text (em boxes shrunk to about the ink).
  const boxes = texts.map((x) => ({ x, b: shrink(x.box, 0.12) }))
  let over = 0
  const firstOver: string[] = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (quadsOverlap(boxes[i].b, boxes[j].b, 0.5)) { over++; if (firstOver.length < 2) firstOver.push(`"${boxes[i].x.s}" × "${boxes[j].x.s}"`) }
  }
  if (over) out.push(`${over} text overlaps (${firstOver.join('; ')})`)
  // Text over a sticker.
  let onSticker = 0
  for (const { b } of boxes) for (const im of images) if (quadsOverlap(b, im, 1)) onSticker++
  if (onSticker) out.push(`${onSticker} texts over stickers`)
  // The axis: its numbers present with the time scale on, clear of one another and of the branches.
  const axisNums = texts.filter((x) => /mono/.test(x.font) && r.ages.has(x.s))
  const caption = texts.some((x) => x.s.startsWith(r.t.collage.tree.axis.slice(0, 6)))
  if (time && (axisNums.length < 2 || !caption)) out.push(`axis missing (${axisNums.length} numbers, caption ${caption})`)
  if (!time && axisNums.length) out.push(`ages drawn with the time scale off`)
  // The branches (Ink or Line), not the age rings (Hairline), which the ages sit on by design.
  const branchPts: Pt[] = strokes.filter((_, i) => r.rec.strokeStyles[i] !== '#ddd').flat()
  let numOnBranch = 0
  for (const n of axisNums) {
    const b = shrink(n.box, 0.15)
    if (branchPts.some((p) => inQuad(b, p))) numOnBranch++
  }
  if (numOnBranch) out.push(`${numOnBranch} age numbers on branches`)
  // Empty bands between the head and the footer: everything drawn, top to bottom, inside the drawing's area.
  const c = r.L.collage
  const ink: [number, number][] = [...texts.map((x) => yRange(x.box)), ...images.map(yRange), ...rects.map((x) => yRange(x.box)), ...strokes.filter((s) => s.length).map((s) => s.reduce<[number, number]>((m, p) => [Math.min(m[0], p[1]), Math.max(m[1], p[1])], [Infinity, -Infinity]))]
  // The drawing's own area (the row is the frame's, under it).
  const foot = c.y + c.h
  const block = ink.filter(([a, b]) => b > c.y && a < foot)
  const gap = largestGap(block, c.y, foot)
  // A Fan (2:1) or a Radial (1:1) already as wide as the area is as large as the card allows (it can't be taller without
  // its names shrinking): its leftover height is then split evenly above and below it, and nothing inside is empty.
  const lo = Math.min(...block.map((x) => x[0])), hi = Math.max(...block.map((x) => x[1]))
  const xs = [...texts.flatMap((x) => x.box), ...images.flat()].map((p) => p[0])
  const fullWidth = r.round && Math.min(...xs) <= c.x + c.w * 0.03 && Math.max(...xs) >= c.x + c.w * 0.97
  const inner = largestGap(block, lo, hi), above = lo - c.y, below = foot - hi
  if (fullWidth ? inner > r.L.H / 10 || Math.abs(above - below) > r.L.H / 20 : gap > r.L.H / 10) {
    out.push(`empty band ${Math.round(gap)} of ${Math.round(r.L.H)} (${Math.round((100 * gap) / r.L.H)}%)${fullWidth ? ` above ${Math.round(above)} below ${Math.round(below)}` : ''}`)
  }
  return out
}

const COMBOS = (Object.keys(CARDS) as Layout[]).flatMap((layout) => CARDS[layout].flatMap((format) =>
  [true, false].flatMap((time) => [true, false].flatMap((totals) => LEVELS.flatMap(({ name, level }) =>
    (['en', 'de'] as const).map((lang) => ({ layout, format, time, totals, level, name, lang })))))))

/** SWEEP_DEBUG="<layout> <format> <time> <totals> <tips> <lang>" (e.g. "circle square true false 5 en"): what that one drew. */
async function debug(spec: string, outFile: string) {
  const [layout, format, time, totals, tips, lang] = spec.split(' ')
  const lv = LEVELS.find((l) => l.name.startsWith(tips))!
  const r = await render({ layout: layout as Layout, format: format as CardFormat, time: time === 'true', totals: totals === 'true', level: lv.level, lang: lang as 'en' | 'de' })
  const lines = [`card ${r.L.W}x${r.L.H} collage ${JSON.stringify(r.L.collage)} fits ${JSON.stringify(r.fits)}`, ...problems(r, time === 'true')]
  for (const x of r.rec.texts) lines.push(`text ${JSON.stringify(x.s)} ${x.font} ${x.box.map((p) => p.map(Math.round).join(',')).join(' ')}`)
  for (const im of r.rec.images.slice(0, 8)) lines.push(`image ${im.map((p) => p.map(Math.round).join(',')).join(' ')}`)
  lines.push(`strokes ${r.rec.strokes.length}`)
  for (const st of r.rec.strokes.slice(0, 60)) if (st.length) lines.push(`stroke ${st.length} ${st[0].map(Math.round)} .. ${st.at(-1)!.map(Math.round)}`)
  ;(await import('node:fs')).writeFileSync(outFile, lines.join('\n'))
}

describe('the Tree image, every combination', () => {
  if (process.env.SWEEP_DEBUG) it('debug', async () => { await debug(process.env.SWEEP_DEBUG!, process.env.SWEEP_OUT!) })
  if (!process.env.SWEEP_DEBUG) it(`${COMBOS.length} images: no overlaps, every name and count, the axis, no empty band`, async () => {
    const bad: string[] = []
    for (const c of COMBOS) {
      const r = await render(c)
      // A Fan or Radial the image can't draw is drawn as rows and offered off by the dialog: checked as drawn.
      const p = problems(r, c.time)
      if (p.length) bad.push(`${c.layout} ${c.format} time:${c.time} totals:${c.totals} ${c.name} ${c.lang} ${JSON.stringify(r.fits)}: ${p.join(' | ')}`)
    }
    if (process.env.SWEEP_OUT) (await import('node:fs')).writeFileSync(process.env.SWEEP_OUT, bad.join('\n'))
    expect(bad).toEqual([])
  }, 600_000)
})
void (null as unknown as Drawn)
