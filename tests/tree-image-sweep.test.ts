// The Tree image, swept (round 6, item 16, the maintainer: "I keep finding such problems"): every arrangement (Fan,
// Radial, Rectangular) on every card it is drawn on (the Fan horizontal: Desktop, the 5:4 post, Square; the others
// vertical: Story, Post, Square), with the time scale on and off, every total or none, with a title or none, at a level
// of 5, 27, 93 and 141 tips of the shipped tree (Gamebirds' families, Cuckoos' genera, Tanagers' genera, Perching birds'
// families), in English and German; and the posters, A4 to A1 in both orientations (round 6, item 11). Drawn from the
// real renderer through a recording canvas that measures text with the stored glyph advances
// (tests/fixtures/tree-image-harness.ts), each image is checked for: the arrangement asked for is the one drawn (round
// 6, item 9: every arrangement is offered at every level, a title or the Totals never change it), no text over other
// text, every tip's name (whole, or wrapped onto two lines) and count, no name over NAME_CAP on a share card, the
// small-names note exactly when names go under NAME_READ or counts under COUNT_READ, the axis's numbers clear of each
// other, the branches and the labels, the axis present with the time scale on, and no empty band taller than a tenth of
// the card between the head and the footer (a Rectangular poster's rows reaching down to the gap above the footer's
// row or hairline).
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
import { COUNT_READ, NAME_CAP, NAME_READ } from '@/lib/share/tree-image'
import { printDesign, type PrintSize } from '@/lib/share/print'
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
      // The card as the real frame lays it out (prepareCard): the title, the view's footer, the Tree's tighter gaps, a poster's size.
      const print = opts.format === 'print' || opts.format === 'printLandscape'
      const L = cardLayout(opts.format, { name: !!opts.name, filter: false, latest: !!opts.latestAs, count: 0, countSize: 'hide', viewFooter: true, ...(opts.tight ? { tight: true } : {}) }, print ? printDesign(opts.printSize ?? 'A2', opts.format === 'printLandscape') : undefined)
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
const POSTERS: PrintSize[] = ['A4', 'A3', 'A2', 'A1']

beforeAll(() => {
  (globalThis as { __tree?: unknown }).__tree = tree;
  (globalThis as { __species?: unknown }).__species = species;
  (globalThis as { Path2D?: unknown }).Path2D = class { constructor(public d?: string) {} }
})

type Layout = 'fan' | 'circle' | 'rows'
const CARDS: Record<Layout, CardFormat[]> = { fan: ['desktop', 'wide', 'square'], circle: ['story', 'post', 'square'], rows: ['story', 'post', 'square'] }
const LEVELS: { name: string; level: TreeLevel }[] = [{ name: '5 families', level: { ord: 'Galliformes' } }, { name: '27 genera', level: { ord: 'Cuculiformes' } }, { name: '93 genera', level: { ord: 'Passeriformes', fam: 'Thraupidae' } }, { name: '141 families', level: { ord: 'Passeriformes' } }]
const LANGS = { en, de }

type Tip = Exclude<TreeRow, { kind: 'head' }>
/** What one render drew, and what it should have. */
async function render(o: { layout: Layout; format: CardFormat; time: boolean; totals: boolean; level: TreeLevel; lang: 'en' | 'de'; title?: boolean; size?: PrintSize; oldest?: boolean }) {
  const t = LANGS[o.lang].ui
  setNames(o.lang === 'de' ? deNames : null)
  const told: { layout: Layout; px: number; small: boolean }[] = []
  await renderTreeImage({
    format: o.format, entries, species, theme: 'light', strings: t, latest: false, ...(o.title ? { name: 'Yusuf’s tree of birds' } : {}), ...(o.size ? { printSize: o.size } : {}),
    at: { tree: o.level, layout: o.layout, time: o.time }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t,
    totals: o.totals ? undefined : [], oldest: o.oldest ?? true, onTreeText: (x: { layout: Layout; px: number; small: boolean }) => told.push(x),
  } as unknown as Parameters<typeof renderTreeImage>[0])
  const v = levelView(tree, species, o.level, codes)!
  const tips = v.rows.filter((r): r is Tip => r.kind !== 'head')
  const nameOf = (r: Tip) => (r.kind === 'species' ? r.row.com : v.tips === 'genera' ? r.key : v.tips === 'orders' ? (t.orders as Record<string, string>)[r.row.ord] ?? r.row.ord : familyName(r.row))
  const countOf = (r: Tip) => (r.kind === 'group' ? fmt(t.collage.tree.tipOf, { n: formatInt(r.on, t.num), total: formatInt(r.total, t.num) }) : '')
  const ages = new Set(Array.from({ length: 400 }, (_, i) => formatAge(i * 5, t.num)).concat(Array.from({ length: 400 }, (_, i) => formatAge(i, t.num))))
  // What the image says it drew (round 6, item 9): the arrangement, the names' size, whether they are small.
  const text = told.at(-1)!
  const round = text.layout !== 'rows'
  // The oldest lineage (Show oldest lineage is on): one line, name first, on Desktop, Post and Square.
  const old = oldestLineage(tree, codes)!
  const oldest = { name: species.byCode.get(old.code)!.com, forms: [t.collage.tree.oldestDetail, t.collage.tree.oldestLabel].map((f) => fmt(f, { age: formatAge(old.age, t.num) })), oneLine: INLINE_ROW.has(o.format) }
  const share = o.format !== 'print' && o.format !== 'printLandscape'
  return { ...frame.last!, t, tips, names: tips.map(nameOf), counts: tips.map(countOf), ages, fits: text, round, oldest, oldestOn: o.oldest ?? true, want: o.layout, text, share }
}

/** Every problem in one render, in words. */
function problems(r: Awaited<ReturnType<typeof render>>, time: boolean): string[] {
  const out: string[] = []
  const { texts, images, strokes, rects } = r.rec
  const drawn = texts.map((x) => x.s)
  // The arrangement asked for, always (round 6, item 9).
  if (r.text.layout !== r.want) out.push(`drew ${r.text.layout} for ${r.want}`)
  // Every tip's name, whole on one line or wrapped at a space onto two (Rectangular, round 6, item 9), and its count.
  const whole = (n: string) => drawn.includes(n) || n.split(' ').some((_, k, w) => k > 0 && drawn.includes(w.slice(0, k).join(' ')) && drawn.includes(w.slice(k).join(' ')))
  const missingNames = r.names.filter((n) => !whole(n))
  if (missingNames.length) out.push(`${missingNames.length} names missing or cut (${missingNames.slice(0, 3).join(', ')})`)
  const missingCounts = r.counts.filter((c, i) => c && !drawn.includes(c) && r.names[i])
  const countsWanted = r.counts.filter(Boolean).length
  const countsDrawn = texts.filter((x) => /\d/.test(x.s) && r.counts.includes(x.s)).length
  if (missingCounts.length || countsDrawn < countsWanted) out.push(`${countsWanted - countsDrawn} counts missing`)
  // The names' size: none over NAME_CAP on a share card; the note exactly when a name is under NAME_READ or a count under COUNT_READ.
  const nameParts = new Set(r.names.flatMap((n) => [n, ...n.split(' ').flatMap((_, k, w) => (k > 0 ? [w.slice(0, k).join(' '), w.slice(k).join(' ')] : []))]))
  const tipNames = texts.filter((x) => /lifer/.test(x.font) && nameParts.has(x.s) && x.s !== r.oldest.name)
  const tipCounts = texts.filter((x) => /mono/.test(x.font) && r.counts.includes(x.s))
  const namePx = Math.min(...tipNames.map((x) => x.px)), countPx = Math.min(...tipCounts.map((x) => x.px))
  if (r.share && Math.max(...tipNames.map((x) => x.px)) > NAME_CAP + 1e-6) out.push(`a name at ${Math.max(...tipNames.map((x) => x.px)).toFixed(1)} over the cap ${NAME_CAP}`)
  const small = namePx < NAME_READ - 1e-6 || countPx < COUNT_READ - 1e-6
  if (small !== r.text.small) out.push(`note ${r.text.small} but names ${namePx.toFixed(1)}, counts ${countPx.toFixed(1)}`)
  // The oldest lineage row (the frame's paintRow): the whole name, and on one line the detail or its short form, whole.
  if (!r.oldestOn) { if (r.latestAs) out.push('oldest lineage drawn while off') } else if (!r.latestAs) out.push('oldest lineage missing')
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
  // The caption whole: the drawing leaves it its room after the 0 tick (rowsLabels' maxTree).
  if (time && !texts.some((x) => x.s === r.t.collage.tree.axis)) out.push('axis caption cut')
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
  [true, false].flatMap((time) => [true, false].flatMap((totals) => [false, true].flatMap((title) => LEVELS.flatMap(({ name, level }) =>
    (['en', 'de'] as const).map((lang) => ({ layout, format, time, totals, title, level, name, lang }))))))))
/** The posters (round 6, item 11): A4 to A1, the Fan on the landscape card, the others upright, Totals and the oldest
 *  lineage each on and off. */
const POSTER_COMBOS = (Object.keys(CARDS) as Layout[]).flatMap((layout) => POSTERS.flatMap((size) =>
  [true, false].flatMap((time) => [true, false].flatMap((totals) => [true, false].flatMap((oldest) => LEVELS.map(({ name, level }) =>
    ({ layout, format: (layout === 'fan' ? 'printLandscape' : 'print') as CardFormat, size, time, totals, oldest, level, name, lang: 'en' as const })))))))

/** A Rectangular poster's rows reach down to the gap above the footer's row or hairline (round 6, item 11): what is
 *  drawn ends at most 2% of the card's height above the drawing's area's bottom, or is centred in it. */
function posterFill(r: Awaited<ReturnType<typeof render>>): string[] {
  if (r.text.layout !== 'rows') return []
  const c = r.L.collage, foot = c.y + c.h
  const { texts, images, strokes } = r.rec
  const ink: [number, number][] = [...texts.map((x) => yRange(x.box)), ...images.map(yRange), ...strokes.filter((s) => s.length).map((s) => s.reduce<[number, number]>((m, p) => [Math.min(m[0], p[1]), Math.max(m[1], p[1])], [Infinity, -Infinity]))].filter(([a, b]) => b > c.y && a < foot)
  const lo = Math.min(...ink.map((x) => x[0])), hi = Math.max(...ink.map((x) => x[1]))
  const above = lo - c.y, below = foot - hi
  return below > r.L.H * 0.02 && Math.abs(above - below) > r.L.H * 0.01 ? [`rows end ${Math.round(below)} above the footer's gap (top ${Math.round(above)})`] : []
}

/** SWEEP_DEBUG="<layout> <format> <time> <totals> <tips> <lang>" (e.g. "circle square true false 5 en"): what that one drew. */
async function debug(spec: string, outFile: string) {
  const [layout, format, time, totals, tips, lang, title, size] = spec.split(' ')
  const lv = LEVELS.find((l) => l.name.startsWith(tips))!
  const r = await render({ layout: layout as Layout, format: format as CardFormat, time: time === 'true', totals: totals === 'true', level: lv.level, lang: lang as 'en' | 'de', title: title === 'true', ...(size ? { size: size as PrintSize } : {}) })
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
      if (p.length) bad.push(`${c.layout} ${c.format} time:${c.time} totals:${c.totals} title:${c.title} ${c.name} ${c.lang} ${JSON.stringify(r.fits)}: ${p.join(' | ')}`)
    }
    if (process.env.SWEEP_OUT) (await import('node:fs')).writeFileSync(process.env.SWEEP_OUT, bad.join('\n'))
    expect(bad).toEqual([])
  }, 600_000)
  if (!process.env.SWEEP_DEBUG) it(`${POSTER_COMBOS.length} posters: the same checks, and Rectangular's rows down to the footer's gap`, async () => {
    const bad: string[] = []
    for (const c of POSTER_COMBOS) {
      const r = await render(c)
      const p = [...problems(r, c.time), ...posterFill(r)]
      if (p.length) bad.push(`${c.layout} ${c.size} time:${c.time} totals:${c.totals} oldest:${c.oldest} ${c.name}: ${p.join(' | ')}`)
    }
    if (process.env.SWEEP_OUT) (await import('node:fs')).writeFileSync(`${process.env.SWEEP_OUT}.posters`, bad.join('\n'))
    expect(bad).toEqual([])
  }, 600_000)
})
void (null as unknown as Drawn)
