// The share dialog's desktop grid, read from share.css (no layout engine runs in Node): the top row never runs onto the
// options below it; from 720px (round 6, item 10) the dialog is centred, pinned near the window's top and as large as
// the window allows (at most 1,440 × 1,000), its size from the window alone; the controls' column at its right scrolls
// only when taller than it, and the preview takes the rest, the image as large as that allows, at its top. On a
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
  it('has no layout of its own for Horizontal: every shape is the same dialog', () => {
    expect(css).not.toMatch(/data-layout/)
  })
})

describe('the share dialog: as big as possible, centred, top-aligned (round 6, item 10)', () => {
  it('centres the dialog across the window, 32px from its top, as large as the window allows up to 1,440 × 1,000', () => {
    const scrim = rule('.eb-share-scrim', DESKTOP)
    expect(scrim).toMatch(/--top:\s*32px/)
    expect(scrim).toMatch(/--dlg-w:\s*1440px/)
    expect(scrim).toMatch(/--dlg-h:\s*1000px/)
    expect(scrim).toMatch(/place-items:\s*start center/)
    expect(scrim).toMatch(/padding-top:\s*var\(--top\)/)
    const dialog = rule('.eb-share-scrim .eb-share', DESKTOP)
    expect(dialog).toMatch(/width:\s*min\(100%, var\(--dlg-w\)\)/)
    expect(dialog).toMatch(/height:\s*min\(100dvh - var\(--top\) - 16px, var\(--dlg-h\)\)/)
    expect(dialog).toMatch(/overflow:\s*hidden/)
  })
  it('sizes nothing from the content: no fit-content, no measured heights, nothing per format, orientation or subject', () => {
    expect(css).not.toMatch(/fit-content|--col-h|--scroll-h|--pv-h|--pad-r|contain-intrinsic/)
    expect(css).not.toMatch(/data-layout|\[data-subject/)
  })
  it('two parts, both top-aligned: the preview\'s area and the controls\' column at the right, its width as before', () => {
    const body = rule('.eb-share-body', DESKTOP)
    expect(body).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) var\(--ctl\)/)
    expect(body).toMatch(/grid-template-rows:\s*max-content minmax\(0, 1fr\)/)
    expect(body).toMatch(/flex:\s*1 1 auto/)
    expect(rule('.eb-share-scrim', DESKTOP)).toMatch(/--ctl:\s*300px/)
    expect(css).toContain('@media (min-width: 1000px) { .eb-share-scrim { --ctl: 420px; } }')
    const area = rule('.eb-share-area', DESKTOP)
    expect(area).toMatch(/grid-row:\s*1 \/ span 2/)
    expect(area).toMatch(/container-type:\s*size/)
    expect(area).toMatch(/justify-content:\s*center/)
    expect(area).toMatch(/align-items:\s*flex-start/)
  })
  it('fits the card in the area (contain): as large as it allows, never cropped, its own shape', () => {
    const pv = rule('.eb-share-preview', '.eb-share-area { grid-column: 1')
    expect(pv).toMatch(/width:\s*min\(100cqw, 100cqh \* var\(--ar\)\)/)
    expect(pv).toMatch(/height:\s*min\(100cqh, 100cqw \/ var\(--ar\)\)/)
  })
  it('the column scrolls only when taller than the dialog, its inset never cutting the coffee button, which sits at its foot', () => {
    const scroll = rule('.eb-share-scroll', '/* The column scrolls on its own')
    expect(scroll).toMatch(/overflow:\s*hidden auto/)
    expect(scroll).toMatch(/min-height:\s*0/)
    expect(scroll).toMatch(/padding:\s*8px; margin:\s*-8px/)
    expect(scroll).not.toMatch(/max-height/)
    expect(rule('.eb-share-scroll', '/* The column: the controls, then the coffee')).toMatch(/flex-direction:\s*column;\s*gap:\s*12px/)
    expect(rule('.eb-share-coffee')).toMatch(/margin:\s*auto -6px -6px/)
  })
  /** The dialog and the preview at a window `vw` × `vh` for a shape `ar` (share.css from 720px). */
  const model = (vw: number, vh: number, ar: number) => {
    const ctl = vw >= 1200 ? 480 : vw >= 1000 ? 420 : 300
    const w = Math.min(vw - 32, 1440), h = Math.min(vh - 48, 1000)
    // The area: the dialog less its 1px border and 20px padding each side, the column and the 20px gap; under its head.
    const areaW = w - 42 - ctl - 20, areaH = h - 92
    const pw = Math.min(areaW, areaH * ar), ph = Math.min(areaH, areaW / ar)
    return { w, h, left: (vw - w) / 2, areaW, areaH, pw, ph }
  }
  it('at the maintainer\'s windows every shape is as large as its area allows, the dialog centred and the same for all', () => {
    const shapes = [9 / 16, 4 / 5, 1, 16 / 9, 5 / 4, 1240 / 1754, 1754 / 1240, 2 / 3, 3 / 2]
    for (const [vw, vh] of [[1280, 720], [1440, 830], [1440, 900], [1920, 960], [1024, 768], [800, 900]]) {
      const ms = shapes.map((ar) => model(vw, vh, ar))
      // One dialog for every shape: same width, height and left edge.
      expect(new Set(ms.map((m) => `${m.w}×${m.h}@${m.left}`)).size).toBe(1)
      for (const m of ms) {
        expect(m.left).toBeGreaterThanOrEqual(16)
        // Fitted: it touches the area's width or its height.
        expect(Math.max(m.pw / m.areaW, m.ph / m.areaH)).toBeCloseTo(1, 6)
        expect(m.pw).toBeLessThanOrEqual(m.areaW + 1e-6)
        expect(m.ph).toBeLessThanOrEqual(m.areaH + 1e-6)
      }
    }
    // 1920 × 960: a 1,440 × 912 dialog; the story 820 tall (461 wide), far past round 6's 225px.
    const story = model(1920, 960, 9 / 16)
    expect(story).toMatchObject({ w: 1440, h: 912 })
    expect(story.ph).toBe(820)
    expect(story.pw).toBeGreaterThan(450)
  })
})

describe('the share dialog: no scrolling on a 1440 × 830 window with everything closed', () => {
  const H = 830
  it('the chrome is 140px: the dialog 32px from the top and 16px from the bottom, its border, padding, head and gap', () => {
    const dialog = rule('.eb-share')
    const [top, , bottom] = /padding:\s*(\d+)px (\d+)px (\d+)px/.exec(dialog)!.slice(1).map(Number)
    const head = px(rule('.eb-share-close'), 'height')
    const own = 2 + top + bottom + head + px(dialog, 'gap')
    expect(own).toBe(92)
    expect(32 + 16 + own).toBe(140)
    expect(rule('.eb-share-scrim .eb-share', DESKTOP)).toMatch(/height:\s*min\(100dvh - var\(--top\) - 16px/)
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
    // The size, then Arrangement, Appearance, Count (segmented), Show latest lifer, Show species names, Transparent
    // background (switches). No Goal.
    const list = sizeRow + 3 * segRow + 3 * row
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
    const column = seg + gap + title + optionsGap + list + optionsGap + bulk + gap + actions + gap + status + gap + filters + gap + coffee
    expect(Math.ceil(column)).toBe(674) // the figure share.css's comment gives
    expect(Math.ceil(column)).toBeLessThanOrEqual(H - 140)
    expect(css).toContain('takes 674')
    // The empty status line gives its gap back, so the usual column is shorter still.
    expect(rule('.eb-share-controls > [role="status"]:empty')).toMatch(new RegExp(`margin-top:\\s*-${gap}px`))
  })
  it('the format and orientation row fits on one line at the 480px column', () => {
    // English, the longest of the short ones: Story, Post, Square and Vertical, Horizontal at 16px, 10px padding each.
    expect(rule('.eb-share-toprow .eb-seg-btn')).toMatch(/padding:\s*0 10px/)
  })
})
