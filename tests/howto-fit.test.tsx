// @vitest-environment jsdom
// The About demo's fit, without a browser: the scene is rendered in each language (the same server render as the poster),
// and every label that sits in a box the CSS fixes (how-it-works.css: the 524 / 310px columns, the nowrap rows, the
// dock's one row, the chips' two rows, the share dialog's 284px controls and 160px compact column) is measured with the
// served fonts' advance widths (tests/fixtures/glyph-advances.json) against that box. A label that cannot fit must be able
// to wrap (the CSS says so) or the test fails: nothing is truncated. Positions the script uses (cursor stops, drag
// targets) are never constants: HowItWorksStage.tsx reads every one from the rendered element (`a.rect('<data-target>')`),
// which the last test pins.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HowItWorksPoster } from '@/components/about/HowItWorksDemo'
import { GEO } from '@/components/about/HowItWorksScene'
import { SHARE } from '@/components/about/how-it-works-data'
import { LANGS } from '@/i18n/langs'
import glyphs from './fixtures/glyph-advances.json'
import { withI18n } from './i18n-render'

type FontKey = keyof typeof glyphs.fonts
const ROOT = join(__dirname, '..')

/** A string's width at `px`: the sum of its advances plus the most kerning widens it, and letter-spacing after every glyph. */
function width(font: FontKey, s: string, px: number, ls = 0): number {
  const f = glyphs.fonts[font]
  const adv = f.advances as Record<string, number>
  let em = f.kernWidenEm
  for (const ch of s) em += (adv[ch] ?? adv.n ?? 0.6) + ls
  return em * px
}
const body = (s: string, px: number, bold = false) => width(bold ? 'satoshi-700' : 'satoshi-500', s, px)
const display = (s: string, px: number) => width('cabinet-grotesk-700', s, px, -0.01)
const mono = (s: string, px: number, ls = 0) => width('geist-mono-500', s.toUpperCase(), px, ls)

function dom(lang: (typeof LANGS)[number]): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = renderToString(createElement(withI18n(lang), null, createElement(HowItWorksPoster)))
  return host
}
const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const all = (root: Element, sel: string) => [...root.querySelectorAll(sel)]

/** Greedy wrap of items (widths, with a gap) into rows of `room`; returns the row count. */
function rows(items: number[], room: number, gap: number): number {
  let n = 1
  let used = 0
  for (const w of items) {
    if (used > 0 && used + gap + w > room) { n++; used = w } else used += (used > 0 ? gap : 0) + w
  }
  return n
}
/** Lines a wrapping text takes in `room` px, by words (px per word from `measure`). */
function lines(text: string, room: number, measure: (s: string) => number): number {
  return rows(text.split(' ').map(measure), room, measure(' '))
}

const MARGIN = 3 // kerning, rounding
const name2wide = (root: Element) => root.getAttribute('data-poster') === 'wide'

describe.each(LANGS)('About demo fit in %s', (lang) => {
  const host = dom(lang)
  const wide = host.querySelector('[data-poster="wide"]')!
  const compact = host.querySelector('[data-poster="compact"]')!
  const COL = { wide: GEO.wide.col, compact: GEO.compact.col }

  it('the page head: title and buttons share one row', () => {
    for (const [name, root, px, w, col] of [['wide', wide, 24, 82, COL.wide], ['compact', compact, 20, 82, COL.compact]] as const) {
      const title = display(txt(root.querySelector('.ebd-head-title')), px)
      const share = Math.max(w, body(txt(root.querySelector('.ebd-btn-share')), 13, true) + 15 + 6 + 26)
      const add = name === 'wide' ? body(txt(root.querySelector('.ebd-btn-add')), 13) + 15 + 6 + 26 : 30
      expect(title + 12 + add + 6 + share + MARGIN, name).toBeLessThanOrEqual(col)
    }
  })

  it('the stats line (one nowrap row) fits the column', () => {
    for (const sw of all(wide, '.ebd-stats .ebd-swap > *')) expect(mono(txt(sw), 10.5, 0.06) + MARGIN, txt(sw)).toBeLessThanOrEqual(COL.wide)
  })

  it('the controls bar is one row on the wide design', () => {
    const t = (sel: string) => txt(wide.querySelector(sel))
    const sws = all(wide, '.ebd-sw').map((e) => body(txt(e), 12) + 7 + 24 + 18)
    const filters = body(txt(wide.querySelector('.ebd-drop')), 12) + 15 + 5 + 10 + 5 + 18
    const total = 2 * 30 + 2 + 2 + sws[0] + 2 + sws[1] + 6 + filters + 6 + 30 + 8 + 2
    // two icon tabs, the tools pushed right, Filters, search: the bar is the column wide
    expect(t('.ebd-drop')).toBeTruthy()
    expect(total + MARGIN).toBeLessThanOrEqual(COL.wide)
  })

  it('the controls bar on the compact design: row one holds the tabs, the two switches and the search', () => {
    const sws = all(compact, '.ebd-sw').map((e) => body(txt(e), 11.5) + 7 + 24 + 14)
    const row1 = 2 * 28 + 2 + 2 + sws[0] + 2 + sws[1] + 4 + 28 + 8 + 2
    expect(row1 + MARGIN).toBeLessThanOrEqual(COL.compact)
    // the Filters button is its own full-width row
    expect(body(txt(compact.querySelector('.ebd-drop')), 11.5) + 15 + 5 + 10 + 14 + MARGIN).toBeLessThanOrEqual(COL.compact)
  })

  it('the order chips wrap into the two rows the filter box has (wide), the picker fits (compact)', () => {
    const chips = all(wide, '.ebd-chips > .ebd-chip').map((c) => 2 + 18 + body(txt(c.firstChild as Element ?? c), 12) + 5 + body(txt(c.querySelector('.ebd-chip-n')), 12))
    const label = mono(txt(wide.querySelector('.ebd-chips-label')), 10.5, 0.06) + 3
    // the label leads the first row
    // the filter box grows with a third row (31px); the stage has 42px under the collage (window top 28, bar 46, page head 32, stats 20,
    // dock 46, two rows 56, gaps, collage 166: 428 of 470)
    expect(rows([label + 5 + chips[0], ...chips.slice(1)].map((w) => w + MARGIN), COL.wide, 5)).toBeLessThanOrEqual(3)
    const pick = body(txt(compact.querySelector('.ebd-pick-label')), 12) + body(txt(compact.querySelector('.ebd-pick .ebd-chip-n')), 12) + 15 + 8 * 3 + 22
    expect(pick + MARGIN).toBeLessThanOrEqual(COL.compact)
  })

  it('the compact order sheet holds its chips in four rows at most', () => {
    const chips = all(compact, '.ebd-sheet-chips .ebd-chip').map((c) => 2 + 18 + body(txt(c.firstChild as Element ?? c), 12) + 5 + body(txt(c.querySelector('.ebd-chip-n')), 12) + MARGIN)
    expect(rows(chips, 326 - 24 - 2, 5)).toBeLessThanOrEqual(4)
  })

  it('the breadcrumb (nowrap) fits the column', () => {
    for (const [root, px, gap, col] of [[wide, 13, 7, COL.wide], [compact, 11.5, 5, COL.compact]] as const) {
      const parts = all(root, '.ebd-path > span').map(txt)
      const w = parts.reduce((n, p, i) => n + body(p, px, i === parts.length - 1) + (i ? gap : 0), 0)
      expect(w + MARGIN, parts.join(' ')).toBeLessThanOrEqual(col)
    }
  })

  it("the count's label fits its box", () => {
    expect(mono(txt(wide.querySelector('.ebd-mid-label')), 11, 0.06) + MARGIN).toBeLessThanOrEqual(120)
    expect(mono(txt(compact.querySelector('.ebd-mid-label')), 10, 0.06) + MARGIN).toBeLessThanOrEqual(90)
  })

  it("the top bar: wordmark, then Collage, Settings, About fit the window's column", () => {
    const links = (root: Element, px: number, pad: number) => all(root, '.ebd-nav-link').map((e) => body(txt(e), px, true) + 2 * pad + 2)
    const wideW = display('Everybird', 18) + 8 + 168 + links(wide, 13, 10).reduce((a, b) => a + b + 2, 0)
    expect(wideW + MARGIN).toBeLessThanOrEqual(COL.wide)
    const compactW = display('Everybird', 16) + 8 + links(compact, 12, 8).reduce((a, b) => a + b + 2, 0)
    expect(compactW + MARGIN).toBeLessThanOrEqual(COL.compact)
  })

  it('Settings: a source row keeps its title and buttons on one line; a status wraps, never under the buttons', () => {
    for (const [name, root, tPx, mPx, room, gap] of [['wide', wide, 13.5, 12, COL.wide - 2 - 28, 12], ['compact', compact, 12.5, 11, COL.compact - 2 - 24, 8]] as const) {
      for (const row of all(root, '.ebd-src')) {
        // the file's name beside the title shows on the wide design only (compact hides it: no room beside the buttons)
        const file = txt(row.querySelector('.ebd-src-name'))
        const title = body(txt(row.querySelector('.ebd-src-title')).replace(file, '').trim(), tPx, true) + (file && name2wide(root) ? body(file, tPx) + 8 : 0)
        const metas = all(row, '.ebd-src-meta .ebd-swap').filter((e) => !e.querySelector('.ebd-swap')).map(txt)
        const own = all(row, '.ebd-src-meta').filter((e) => !e.querySelector('.ebd-swap')).map(txt)
        const btns = all(row, '.ebd-src-acts .ebd-btn').filter((e) => !e.classList.contains('ebd-menubtn')).map((e) => body(txt(e), 12.5) + 22 + 2)
        const acts = Math.max(...btns) + (row.querySelector('.ebd-menubtn') ? 6 + 28 : 0)
        const text = room - gap - acts - MARGIN
        const label = `${name} ${txt(row.querySelector('.ebd-src-title'))}`
        expect(title, `${label} (title)`).toBeLessThanOrEqual(text)
        for (const m of [...metas, ...own]) {
          // wide: one nowrap line; compact: the text wraps, two lines (the row's height is two lines of title + status)
          const n = lines(m, text, (w) => body(w, mPx))
          expect(n, `${label} (${m})`).toBeLessThanOrEqual(name === 'wide' ? 1 : 2)
        }
      }
    }
  })

  it('Settings: the summary line takes the lines its box has', () => {
    const sum = txt(wide.querySelector('.ebd-sum .ebd-swap-b'))
    expect(lines(sum, COL.wide - MARGIN, (w) => body(w, 13))).toBeLessThanOrEqual(2)
    const c = txt(compact.querySelector('.ebd-sum .ebd-swap-b'))
    expect(lines(c, COL.compact - MARGIN, (w) => body(w, 12))).toBeLessThanOrEqual(2) // its min-height is two lines
  })

  it('the share dialog: the format control, the title field and the actions fit their column', () => {
    const seg = all(wide, '.ebd-seg-btn').map((b) => 16 + body(txt(b.querySelector('.ebd-seg-label')), 12) + 5 + mono(txt(b.querySelector('.ebd-seg-hint')), 10, 0.02))
    expect(seg.reduce((a, b) => a + b, 0) + 3 * 5 + 2 * 3 + 6 + 2 + MARGIN, 'wide seg').toBeLessThanOrEqual(284)
    // compact: the controls column is 160px (326 - 24 - 2 - 128 - 12); the buttons share it by their content, 3px inside each side
    const segC = all(compact, '.ebd-seg-label').map((b) => body(txt(b), 11) + 6)
    expect(segC.reduce((a, b) => a + b, 0) + 2 * 3 + 6 + 2 + MARGIN, 'compact seg').toBeLessThanOrEqual(160)
    const inner = 284 - 20 - 2
    const placeholder = body(txt(wide.querySelector('.ebd-share-input')), 12)
    expect(placeholder + 20 + 2 + MARGIN, 'title placeholder').toBeLessThanOrEqual(inner)
    const label = mono(txt(wide.querySelector('.ebd-share-label')), 10, 0.06) + 6 + mono(txt(wide.querySelector('.ebd-share-optional')), 10)
    expect(label + MARGIN, 'title label').toBeLessThanOrEqual(inner)
    // the quiet row: three buttons each at least its label (they wrap, but keep to two lines)
    const quiet = all(wide, '.ebd-share-row .ebd-btn').map((b) => body(txt(b), 12.5) + 12 + 6 + 16 + 2)
    const each = (284 - 2 * 6) / 3
    for (const [i, w] of quiet.entries()) expect(w <= Math.max(each, 0) || w / 2 <= each, `quiet ${i} ${txt(all(wide, '.ebd-share-row .ebd-btn')[i])}`).toBe(true)
    // the primary button spans the column
    expect(body(txt(wide.querySelector('.ebd-share-primary')), 12.5, true) + 12 + 6 + 16 + 2 + MARGIN).toBeLessThanOrEqual(284)
  })

  it('the share images: the latest lifer row fits beside its sticker (the mock draws its text 1.5 x the true size)', () => {
    for (const format of ['story', 'post', 'square'] as const) {
      const L = SHARE[format]
      const img = wide.querySelector(`.ebd-img[data-format="${format}"]`)!
      const room = L.W - 2 * 64 - L.latest.icon - 20
      const label = width('geist-mono-500', txt(img.querySelector('.ebd-img-latest-label')).toUpperCase(), L.latest.label * 1.5, 0.06)
      const name = body(txt(img.querySelector('.ebd-img-latest-name')), L.latest.name * 1.5, true)
      expect(label + 4, `${format} label`).toBeLessThanOrEqual(room)
      expect(name + 4, `${format} name`).toBeLessThanOrEqual(room)
    }
  })
})

describe('the script reads its positions from the rendered scene', () => {
  const stage = readFileSync(join(ROOT, 'src/components/about/HowItWorksStage.tsx'), 'utf8')
  const host = dom('en')
  const wide = host.querySelector('[data-poster="wide"]')!
  const compact = host.querySelector('[data-poster="compact"]')!
  it('every stop is a rendered data-target (a.move({ at }) measures it), never a pixel constant but the rest position', () => {
    const moves = [...stage.matchAll(/a\.move\(([^)]*)\)/g)].map((m) => m[1])
    for (const m of moves) expect(m, m).toMatch(/at:|REST|grab|card\./)
    const targets = new Set([...stage.matchAll(/(?:at|rect\()\W*'([a-z-]+)'/g)].map((m) => m[1]))
    expect(targets.size).toBeGreaterThan(10)
    const COMPACT_ONLY = ['add-full', 'choose', 'picker', 'sheet-herons']
    const WIDE_ONLY = ['desk-icon', 'desk-file', 'herons']
    for (const t of targets) {
      const sel = `[data-target="${t}"]`
      if (!COMPACT_ONLY.includes(t)) expect(wide.querySelector(sel), `wide ${t}`).not.toBeNull()
      if (!WIDE_ONLY.includes(t)) expect(compact.querySelector(sel), `compact ${t}`).not.toBeNull()
    }
  })
})
