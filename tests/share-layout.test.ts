// The share dialog's desktop grid, read from share.css (no layout engine runs in Node): the top row never runs onto the
// options below it, the dialog is pinned at its top and only as tall as its content (round 6: the preview as tall as
// the controls' column, no bands, nothing centred in leftover room; taller than the window, the column scrolls), and
// on a 1440 × 830 laptop window the tallest column with everything closed fits with nothing scrolling (Yusuf,
// 2026-11-20). The height budget adds share.css's own numbers, each checked to be in the file.
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
const WIDE = '@media (min-width: 720px) {\n  .eb-share-scrim[data-layout="wide"] .eb-share-preview'

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
  it('lays Horizontal out side by side like Vertical, the preview\'s room the whole width left of the column', () => {
    expect(rule('.eb-share-scrim[data-layout="wide"] .eb-share-preview', WIDE)).toMatch(/--room:\s*calc\(100vw - var\(--pad-r\) - var\(--ctl\) - 94px\)/)
    expect(css).not.toMatch(/grid-column:\s*1 \/ -1/)
    // Nothing else changes with the orientation: no other width, padding or animation of its own (round 6).
    expect(css).not.toMatch(/\.eb-share-scrim\[data-layout="wide"\]\s*\{/)
    expect(css).not.toMatch(/data-changing|--wide-w/)
  })
})

describe('the share dialog: pinned at its top, only as tall as its content', () => {
  it('pins the dialog 32px from the window\'s top in both layouts, its right edge fixed, never centred', () => {
    const scrim = rule('.eb-share-scrim', DESKTOP)
    expect(scrim).toMatch(/--top:\s*32px/)
    expect(scrim).toMatch(/place-items:\s*start end/)
    expect(scrim).toMatch(/padding-top:\s*var\(--top\)/)
    // The right edge from the window alone (not from the content), so nothing the column opens moves it.
    expect(scrim).toMatch(/--pad-r:\s*max\(16px, \(100vw - \(max\(240px, min\(var\(--tall\), var\(--room\)\)\) \+ var\(--ctl\) \+ 62px\)\) \/ 2\)/)
    expect(scrim).toMatch(/padding-right:\s*var\(--pad-r\)/)
    // No area the story's size to centre a shorter preview in (phones keep the scrim's own centring across).
    expect(css).not.toMatch(/--story-h/)
  })
  it('the preview is as tall as the controls\' column (measured), at most the window\'s room, its top on the column\'s', () => {
    const pv = rule('.eb-share-preview', DESKTOP)
    expect(pv).toMatch(/align-self:\s*start/)
    expect(pv).toMatch(/--pv-h:\s*max\(160px, min\(var\(--col-h, var\(--tall\)\), var\(--tall\), var\(--room\) \/ var\(--ar\)\)\)/)
    expect(pv).toMatch(/height:\s*var\(--pv-h\); width:\s*calc\(var\(--pv-h\) \* var\(--ar\)\)/)
  })
  it('grows downward to 16px above the window\'s bottom, then the controls\' column scrolls inside it', () => {
    expect(rule('.eb-share', DESKTOP).length).toBeGreaterThan(0)
    expect(css).toContain('.eb-share-scrim .eb-share { max-height: calc(100dvh - var(--top) - 16px); overflow: hidden; }')
    const body = rule('.eb-share-body', DESKTOP)
    expect(body).toMatch(/flex:\s*0 1 auto/)
    expect(body).toMatch(/min-height:\s*0/)
    const scroll = rule('.eb-share-scroll', '/* The column scrolls on its own')
    expect(scroll).toMatch(/overflow:\s*hidden auto/)
    expect(scroll).toMatch(/min-height:\s*0/)
    // Its inset keeps focus rings inside what it shows, and is taken back.
    expect(scroll).toMatch(/padding:\s*8px; margin:\s*-8px/)
  })
})

describe('the share dialog: nothing moves when the format or the orientation changes (round 6)', () => {
  /** The scrim's numbers at a window `vw` × `vh` (share.css, from 720px): the right padding, the controls' column's left
   *  edge, and the preview's box for a shape `ar` in either layout, with a controls' column `colH` tall. */
  const model = (vw: number, vh: number, colH: number) => {
    const ctl = vw >= 1200 ? 480 : vw >= 1000 ? 420 : 300
    const tall = Math.max(240, vh - 32 - 16 - 92)
    const room = Math.min(vw - ctl - 108, 560)
    const padR = Math.max(16, (vw - (Math.max(240, Math.min(tall, room)) + ctl + 62)) / 2)
    // The dialog's right edge is padR from the window's; its 20px padding and 1px border, then the column.
    const colLeft = vw - padR - 21 - ctl
    const preview = (ar: number, wide: boolean) => {
      const r = wide ? vw - padR - ctl - 94 : room
      const h = Math.max(160, Math.min(colH, tall, r / ar))
      // The dialog's left edge: the preview, the 20px gap, then its padding and border.
      return { w: h * ar, h, left: colLeft - 20 - h * ar - 21 }
    }
    return { ctl, colLeft, preview }
  }
  it('the right edge and the column come from the window alone, the same rule in both layouts', () => {
    expect(rule('.eb-share-scrim', DESKTOP)).toMatch(/--ctl:\s*300px/)
    expect(css).toContain('@media (min-width: 1000px) { .eb-share-scrim { --ctl: 420px; } }')
    // The column's width is --ctl in every layout; nothing in the wide layout sets it, the padding or the dialog's width.
    expect(rule('.eb-share-body', DESKTOP)).toMatch(/grid-template-columns:\s*auto var\(--ctl\)/)
    expect(css).not.toMatch(/\[data-layout="wide"\][^{]*\{[^}]*(?:[{;\s])(--ctl|padding[\w-]*|width|--pad-r)\s*:/)
  })
  it('every shape, vertical and horizontal, share and print, keeps the column where it is; the preview stays in the window', () => {
    const vertical = [9 / 16, 4 / 5, 1, 1240 / 1754, 2 / 3, 3 / 4]
    const horizontal = [16 / 9, 5 / 4, 1754 / 1240, 3 / 2, 4 / 3]
    for (const [vw, vh] of [[1440, 830], [1280, 800], [1024, 768], [1920, 1080], [800, 900]]) {
      for (const colH of [520, 674, 900]) {
        const m = model(vw, vh, colH)
        for (const [ar, wide] of [...vertical.map((a) => [a, false] as const), ...horizontal.map((a) => [a, true] as const)]) {
          const p = m.preview(ar, wide)
          // The dialog's left edge is inside the scrim's 16px gutter, never past the window.
          expect(p.left, `${vw}×${vh} ${ar} ${wide}`).toBeGreaterThanOrEqual(16 - 1e-6)
          // Its top is the column's, its height at most the column's: no band above it, none below it unless the
          // window's width is what keeps it shorter.
          expect(p.h).toBeLessThanOrEqual(Math.max(160, colH) + 1e-6)
        }
      }
    }
  })
  it('a horizontal preview at 1440 × 830 is as tall as its room left of the column allows, the column unmoved', () => {
    const m = model(1440, 830, 674)
    const desk = m.preview(16 / 9, true), story = m.preview(9 / 16, false)
    expect(desk.left).toBeCloseTo(16 + 16, 0) // the scrim's gutter and the scrollbar's slack
    expect(story.h).toBe(674)
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
    expect(rule('.eb-share-scrim', DESKTOP)).toMatch(/--tall:\s*max\(240px, 100dvh - var\(--top\) - 16px - 92px\)/)
    expect(css).toContain('@media (min-width: 1200px) { .eb-share-scrim { --ctl: 480px; } }')
  })
  it('the tallest closed column (the collage poster once made: the size, six rows, Export in batches\' row; two rows of actions, a status line and the filters line) fits', () => {
    // With a mouse (a laptop): option rows 36px, the title field and the actions 40px.
    const row = px(rule('.eb-share .eb-share-opt', '@media (pointer: fine)'), 'min-height')
    expect(row).toBe(36)
    const field = px(rule('.eb-share-input, .eb-share-actions .eb-btn', '@media (pointer: fine)'), 'min-height')
    expect(field).toBe(40)
    // The small segmented controls fit the row: 28px segments, a 2px inset, a 1px border.
    expect(rule('.eb-share .eb-share-seg .eb-seg-btn', '/* The choices in the rows')).toMatch(/min-height:\s*28px/)
    expect(rule('.eb-share .eb-share-seg', '/* The choices in the rows')).toMatch(/padding:\s*2px/)
    expect(28 + 2 * 2 + 2).toBeLessThanOrEqual(row)
    // No box and no rules round the list.
    expect(rule('.eb-share-opts')).not.toMatch(/border/)
    expect(css).not.toMatch(/\.eb-share-opts > \* \+ \*/)
    const gap = px(rule('.eb-share-controls', '.eb-share-failed {'), 'gap')
    const optionsGap = px(rule('.eb-share-options'), 'gap')
    const actionsGap = px(rule('.eb-share-actions', '/* The four actions'), 'gap')
    const seg = 44 + 2 * 4 + 2 // the top row's segmented control: a 44px button, 4px padding, 1px border
    expect(rule('.eb-seg-btn', '/* The Story / Post / Square choice')).toMatch(/min-height:\s*44px/)
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
    // The size, then Arrangement, Appearance, Count, Show latest lifer, Show species names, Transparent background. No Goal.
    const list = sizeRow + 6 * row
    // Export in batches, closed: its row in its panel (no border, no padding above or below the row).
    expect(rule('.eb-share-bulk')).not.toMatch(/border:|padding/)
    const bulk = row
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
