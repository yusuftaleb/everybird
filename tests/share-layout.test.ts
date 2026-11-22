// The share dialog's desktop grid, read from share.css (no layout engine runs in Node): the top row never runs onto the
// options below it; from 720px (round 6, item 18) the card is as large as the window allows and the dialog wraps it
// and the controls' column beside it, centred in the window: no empty room beside or under the card beyond the gap
// (a column taller than the card is the one exception: the dialog is then the column's height). On a
// 1440 × 830 laptop window the tallest column with everything closed fits with nothing scrolling (Yusuf, 2026-11-20).
// The height budget adds share.css's own numbers, each checked to be in the file.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/components/share/share.css', 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`, optionally after the text `after`. */
function rule(selector: string, after = ''): string {
  const from = after ? css.indexOf(after) : 0
  expect(from, `"${after}" is in share.css`).toBeGreaterThanOrEqual(0)
  const re = new RegExp(`(^|[\\s}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const m = re.exec(css.slice(from))
  expect(m, `${selector} is in share.css`).not.toBeNull()
  return m![2]
}
const px = (decl: string, prop: string): number => {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`).exec(decl)
  expect(m, `${prop} in "${decl.trim()}"`).not.toBeNull()
  return Number(m![1])
}
const DESKTOP = '@media (min-width: 720px) {\n  .eb-share-scrim {'

describe('the share dialog: the top row clears the options', () => {
  it('keeps no explicit min-height on the format column (it would let the grid squeeze its row)', () => {
    expect(rule('.eb-share-formats')).not.toMatch(/min-height/)
    expect(rule('.eb-share-formats')).toMatch(/flex-direction:\s*column/)
    // The format and the orientation share one row, the orientation wrapping under it where they don't fit.
    expect(rule('.eb-share-toprow')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.eb-share-toprow')).toMatch(/gap:\s*8px/)
  })
  it("gives the desktop body a max-content first row, so the top row can't be squeezed; the second takes what is left", () => {
    const body = rule('.eb-share-body', DESKTOP)
    expect(body).toMatch(/grid-template-rows:\s*max-content minmax\(0, 1fr\)/)
  })
  it('nothing moves the controls up', () => {
    expect(rule('.eb-share-body', '/* The body: the format control')).toMatch(/gap:\s*12px 20px/)
    for (const sel of ['.eb-share-controls', '.eb-share-options', '.eb-share-orient']) {
      const m = new RegExp(`(^|[\\s}])${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g')
      for (const r of css.matchAll(m)) expect(r[2]).not.toMatch(/margin[^;]*-\d|transform|\btop:/)
    }
  })
  it('on a phone: the orientation as icons beside the format, Share image and the quiet row on one wrapping line; a desktop as before', () => {
    const phone = css.slice(css.indexOf('/* Phones (the stacked layout), fewer rows'))
    expect(css).toMatch(/\.eb-orient-icon \{ display: none; \}/)
    expect(css).toMatch(/\.eb-share-trio \{ display: contents; \}/)
    expect(phone).toMatch(/@media \(max-width: 719\.98px\) \{[^]*\.eb-share \.eb-share-orient \.eb-orient-word \{ display: none; \}/)
    expect(phone).toMatch(/\.eb-share \.eb-share-orient \.eb-seg-btn svg\.eb-orient-icon \{ display: block;/)
    expect(phone).toMatch(/\.eb-share-trio \{ display: flex; flex-wrap: wrap; gap: 8px;/)
    expect(phone).toMatch(/\.eb-share-trio > \.eb-share-primary \{ flex-grow: 2; \}/)
  })
  it('has no layout of its own for Horizontal: every shape is the same dialog', () => {
    expect(css).not.toMatch(/data-layout/)
  })
})

describe('the share dialog wraps its card, centred (round 6, item 18)', () => {
  it('the scrim is a size container and centres the dialog; the dialog is as wide as its content, at most the window', () => {
    const scrim = rule('.eb-share-scrim', DESKTOP)
    expect(scrim).toMatch(/container-type:\s*size/)
    expect(scrim).toMatch(/--chrome-h:\s*92px/)
    expect(scrim).toMatch(/--chrome-w:\s*62px/)
    expect(scrim).not.toMatch(/place-items|padding-top|--top|--dlg/)
    expect(rule('.eb-share-scrim')).toMatch(/place-items:\s*center;\s*padding:\s*16px/)
    const dialog = rule('.eb-share-scrim .eb-share', DESKTOP)
    expect(dialog).toMatch(/width:\s*max-content/)
    expect(dialog).toMatch(/max-width:\s*100%/)
    expect(dialog).toMatch(/max-height:\s*100%/)
    expect(dialog).not.toMatch(/(^|[\s;])height:/)
  })
  it('the card at the body\'s top left, the column beside it, both top-aligned, a fixed gap between them', () => {
    const body = rule('.eb-share-body', DESKTOP)
    expect(body).toMatch(/grid-template-columns:\s*max-content var\(--ctl\)/)
    expect(rule('.eb-share-body', '/* The body: the format control')).toMatch(/gap:\s*12px 20px/)
    expect(rule('.eb-share-area', DESKTOP)).toMatch(/grid-row:\s*1 \/ span 2/)
    expect(rule('.eb-share-area', DESKTOP)).not.toMatch(/container-type/)
    const pv = rule('.eb-share-preview', DESKTOP)
    expect(pv).toMatch(/--card-h:\s*min\(100cqh - var\(--chrome-h\), \(100cqw - var\(--chrome-w\) - var\(--ctl\)\) \/ var\(--ar\)\)/)
    expect(pv).toMatch(/width:\s*calc\(var\(--card-h\) \* var\(--ar\)\);\s*height:\s*var\(--card-h\)/)
    expect(pv).toMatch(/justify-self:\s*start;\s*align-self:\s*start/)
    expect(rule('.eb-share-scroll', '/* Its 8px inset')).toMatch(/align-self:\s*start/)
  })
  it('the column follows its content, grows to the card\'s height at most when something opens, then scrolls; never past the window', () => {
    const scroll = rule('.eb-share-scroll', '/* Its 8px inset')
    expect(scroll).toMatch(/overflow:\s*hidden auto/)
    expect(scroll).toMatch(/padding:\s*8px; margin:\s*-8px/)
    expect(scroll).toContain('max-height: calc(min(max(var(--scroll-h, 100cqh), var(--pv-h, 0px) - var(--top-h, 0px)), 100cqh - var(--chrome-h) - var(--top-h, 0px)) + 16px)')
    expect(rule('.eb-share-scroll', '/* The column: the controls, then the coffee')).toMatch(/flex-direction:\s*column;\s*gap:\s*12px/)
    expect(rule('.eb-share-coffee')).toMatch(/margin:\s*auto -6px -6px/)
    expect(css).not.toMatch(/--dlg-w|--dlg-h|--col-h|--pad-r|contain-intrinsic|data-layout|\[data-subject/)
  })

  // The dialog as share.css lays it out: the scrim's 16px round the window, the card fitted in what the window leaves
  // under the dialog's head (92) and beside the column and the chrome across (62), the dialog the card, the gap and the
  // column across and its head and the taller of the card and the closed column down, centred.
  const ctlAt = (vw: number) => (vw >= 1200 ? 480 : vw >= 1000 ? 420 : 300)
  const model = (vw: number, vh: number, ar: number, column: number) => {
    const W = vw - 32, H = vh - 32, ctl = ctlAt(vw)
    const cardH = Math.min(H - 92, (W - 62 - ctl) / ar), cardW = cardH * ar
    const w = cardW + 62 + ctl, h = Math.min(H, 92 + Math.max(cardH, column))
    return { w, h, left: (vw - w) / 2, top: (vh - h) / 2, cardW, cardH, ctl, W, H }
  }
  const SHAPES: Record<string, number> = { story: 9 / 16, post: 4 / 5, square: 1, desktop: 16 / 9, wide: 5 / 4, print: 1240 / 1754, printLandscape: 1754 / 1240 }
  // The collage's Share column closed, with a mouse (as the budget below adds it): the top row 40, 12, the title 64, 8,
  // Arrangement, Appearance and Count 40 each, Show latest lifer, Transparent background and Goal 36 each, 8, Export in
  // batches' row 38, 12, Share image over Download and Copy link 88, 12, the coffee button 38: 548. A short one, the
  // Map's: 40, 12, 64, 8, Appearance, Totals 40 each, Transparent background 36, 12, 88, 12, 38: 390.
  const COLUMNS = [548, 390]
  it('at 1,280 × 720, 1,440 × 900 and 1,920 × 960 no empty room beside or under the card beyond the gap, centred', () => {
    for (const [vw, vh] of [[1280, 720], [1440, 900], [1920, 960]]) {
      for (const [name, ar] of Object.entries(SHAPES)) {
        for (const column of COLUMNS) {
          const m = model(vw, vh, ar, column)
          const what = `${vw}×${vh} ${name} column ${column}`
          // Across: the card, the 20px gap, the column, the 1px borders and 20px padding: nothing else.
          expect(m.w - m.cardW - m.ctl, what).toBeCloseTo(62, 6)
          // Down: the head, then the card, unless the closed column is taller (then the column's height).
          expect(m.h - 92, what).toBeCloseTo(Math.max(m.cardH, column), 6)
          // Fitted whole: the card touches the window's room across or down.
          expect(Math.max(m.cardH / (m.H - 92), m.w / m.W), what).toBeCloseTo(1, 6)
          // Centred, inside the 16px margins.
          expect(m.left, what).toBeGreaterThanOrEqual(16 - 1e-6)
          expect(m.top, what).toBeGreaterThanOrEqual(16 - 1e-6)
        }
      }
    }
    // 1,440 × 900: a Story makes a narrow, tall dialog, a Desktop a wide, shorter one.
    const story = model(1440, 900, SHAPES.story, 548), desk = model(1440, 900, SHAPES.desktop, 548)
    expect(Math.round(story.w)).toBe(979)
    expect(story.h).toBe(868)
    expect(story.cardH).toBe(776)
    expect(Math.round(desk.w)).toBe(1408)
    expect(Math.round(desk.h)).toBe(640)
    expect(Math.round(desk.cardH)).toBe(487)
  })
})

describe('the share dialog: no scrolling on a 1440 × 830 window with everything closed', () => {
  const H = 830
  it('the chrome is 124px: the scrim\'s 16px above and below, the dialog\'s border, padding, head and gap', () => {
    const dialog = rule('.eb-share')
    const [top, , bottom] = /padding:\s*(\d+)px (\d+)px (\d+)px/.exec(dialog)!.slice(1).map(Number)
    const head = px(rule('.eb-share-close'), 'height')
    const own = 2 + top + bottom + head + px(dialog, 'gap')
    expect(own).toBe(92)
    expect(16 + 16 + own).toBe(124)
    expect(rule('.eb-share-scrim', DESKTOP)).toMatch(new RegExp(`--chrome-h:\\s*${own}px`))
    expect(css).toContain('@media (min-width: 1200px) { .eb-share-scrim { --ctl: 480px; } }')
  })
  it('the tallest closed column (the collage poster once made: the size, six rows, Export in batches\' row; two rows of actions, a status line and the filters line) fits', () => {
    // With a mouse (a laptop): option rows 36px, the title field and the actions 40px.
    const row = px(rule('.eb-share .eb-share-opt', '@media (pointer: fine)'), 'min-height')
    expect(row).toBe(36)
    const field = px(rule('.eb-share-input, .eb-share-actions .eb-btn', '@media (pointer: fine)'), 'min-height')
    expect(field).toBe(40)
    // The small segmented controls sit in 40px rows (round 6: air round them as a switch has): 26px segments, a 2px
    // inset, a 1px border, 32px in all, 8px of air in the row.
    expect(rule('.eb-share .eb-share-seg .eb-seg-btn', '/* The choices in the rows')).toMatch(/min-height:\s*26px/)
    expect(rule('.eb-share .eb-share-seg', '/* The choices in the rows')).toMatch(/padding:\s*2px/)
    const segRow = px(rule('.eb-share .eb-share-opt:has(> .eb-share-seg)', '@media (pointer: fine)'), 'min-height')
    expect(segRow).toBe(40)
    expect(segRow - (26 + 2 * 2 + 2)).toBeGreaterThanOrEqual(8)
    // No box and no rules round the list.
    expect(rule('.eb-share-opts')).not.toMatch(/border/)
    expect(css).not.toMatch(/\.eb-share-opts > \* \+ \*/)
    const gap = px(rule('.eb-share-controls', '.eb-share-failed {'), 'gap')
    const optionsGap = px(rule('.eb-share-options'), 'gap')
    const actionsGap = px(rule('.eb-share-actions', '/* The four actions'), 'gap')
    // The top row's segmented control, as tall as the title field (round 6, item 8): 30px segments with a mouse, a 4px
    // inset and a 1px border; 34px on touch (44 in all), the segments' press 44px.
    const seg = 30 + 2 * 4 + 2
    expect(seg).toBe(field)
    expect(css).toContain('@media (pointer: fine) { .eb-share .eb-share-toprow .eb-seg-btn { min-height: 30px; } }')
    expect(rule('.eb-share .eb-share-toprow .eb-seg-btn', '/* The format and orientation controls are as tall')).toMatch(/min-height:\s*34px/)
    expect(rule('.eb-share .eb-share-toprow .eb-seg-btn::after')).toMatch(/inset:\s*-5px 0/)
    expect(rule('.eb-seg', '/* The Story / Post / Square choice')).toMatch(/padding:\s*4px/)
    // The title: its label's line (12px mono at 1.5), the field's gap, the field.
    expect(rule('.eb-share-label')).toMatch(/font-size:\s*12px/)
    expect(rule('.eb-share-labelrow')).toMatch(/line-height:\s*1\.5/)
    const titleField = rule('.eb-share-field')
    expect(titleField).toMatch(/flex-direction:\s*column/)
    const title = 12 * 1.5 + px(titleField, 'gap') + field
    // The size: its label over its line, no padding of the row's own.
    const optcol = rule('.eb-share-optcol')
    expect(optcol).toMatch(/padding-block:\s*2px/)
    expect(optcol).toMatch(/line-height:\s*1\.25/)
    expect(rule('.eb-share-optnote')).toMatch(/font-size:\s*14px;[^}]*line-height:\s*1\.3/)
    expect(rule('.eb-share .eb-share-opt')).toMatch(/padding:\s*0;/)
    const sizeRow = 2 * 2 + 16 * 1.25 + 2 + 14 * 1.3
    // The size, then Arrangement (with True size), Appearance, Count (segmented), Show latest lifer, Show species names,
    // Scientific names, Transparent background (switches). No Goal.
    // Scientific names shows under Show species names (they are on here); True size sits in Arrangement's row.
    const list = sizeRow + 3 * segRow + 4 * row
    // Export in batches, closed: its row in its box, a Hairline border and no fill (round 6), no padding above or below the row.
    const box = rule('.eb-share-bulk')
    expect(box).toMatch(/border:\s*1px solid var\(--hairline\)/)
    expect(box).not.toMatch(/background|padding/)
    const bulk = row + 2
    // Once made: Download PNG and Download PDF, then Copy link (before, Make poster and Copy link are one row).
    const actions = field + actionsGap + field
    const status = 14 * 1.5
    const filters = 36 // .eb-textbtn's height
    const coffee = 32 + 2 * 6 - 6 // the image, its press padding, the negative bottom margin
    // The filters line sits under the title, in the options' 8px gaps (P12).
    const column = seg + gap + title + optionsGap + filters + optionsGap + list + optionsGap + bulk + gap + actions + gap + status + gap + coffee
    expect(Math.ceil(column)).toBe(706) // the figure share.css's comment gives
    expect(Math.ceil(column)).toBeLessThanOrEqual(H - 124)
    expect(css).toContain('takes 706')
    // The empty status line gives its gap back, so the usual column is shorter still.
    expect(rule('.eb-share-controls > [role="status"]:empty')).toMatch(new RegExp(`margin-top:\\s*-${gap}px`))
  })
  it('the format and orientation row fits on one line at the 480px column', () => {
    // English, the longest of the short ones: Story, Post, Square and Vertical, Horizontal at 16px, 10px padding each.
    expect(rule('.eb-share-toprow .eb-seg-btn')).toMatch(/padding:\s*0 10px/)
  })
})
