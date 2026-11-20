// The share dialog's desktop grid, read from share.css (no layout engine runs in Node): the top row never runs onto the
// options box below it, and on a 1440 × 830 laptop window the tallest controls' column fits beside the preview with
// nothing scrolling (Yusuf, 2026-11-20). The height budget adds share.css's own numbers, each checked to be in the file.
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

describe('the share dialog: the top row clears the options box', () => {
  it('keeps no explicit min-height on the format column (it would let the grid squeeze its row)', () => {
    expect(rule('.eb-share-formats')).not.toMatch(/min-height/)
    expect(rule('.eb-share-formats')).toMatch(/flex-direction:\s*column/)
    // The format and the orientation share one row, the orientation wrapping under it where they don't fit.
    expect(rule('.eb-share-toprow')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.eb-share-toprow')).toMatch(/gap:\s*8px/)
  })
  it("gives the desktop body a max-content first row, so the top row can't be squeezed", () => {
    const body = rule('.eb-share-body', '  .eb-share-scrim .eb-share { max-height')
    expect(body).toMatch(/grid-template-rows:\s*max-content 1fr/)
    expect(body).not.toMatch(/grid-template-rows:\s*auto 1fr/)
  })
  it('does not let the dialog squeeze the body below its content (the dialog scrolls instead)', () => {
    expect(rule('.eb-share-body', '  .eb-share-scrim .eb-share { max-height')).toMatch(/flex:\s*none/)
  })
  it('nothing moves the controls\' column up', () => {
    expect(rule('.eb-share-body', '/* The body: the format control')).toMatch(/gap:\s*12px 20px/)
    for (const sel of ['.eb-share-controls', '.eb-share-options', '.eb-share-orient']) {
      const m = new RegExp(`(^|[\\s}])${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g')
      for (const r of css.matchAll(m)) expect(r[2]).not.toMatch(/margin[^;]*-\d|transform|\btop:/)
    }
  })
  it('lays Horizontal out side by side like Vertical, with no stacked layout left', () => {
    const wide = rule('.eb-share[data-layout="wide"] .eb-share-preview')
    expect(wide).toMatch(/width:\s*calc\(var\(--pv-h\) \* var\(--ar\)\)/)
    expect(rule('.eb-share[data-layout="wide"] .eb-share-preview')).toMatch(/--pv-h:\s*min\(var\(--ph\), var\(--pw\) \/ var\(--ar\)\)/)
    expect(css).not.toMatch(/grid-column:\s*1 \/ -1/)
    expect(css).not.toMatch(/--pv-hw|1\.15fr/)
    expect(css).toContain('min(1400px, 94vw)')
  })
})

describe('the share dialog: no scrolling on a 1440 × 830 window', () => {
  const H = 830
  it('the chrome is 124px: the scrim\'s padding, the dialog\'s border, padding, head and gap', () => {
    const dialog = rule('.eb-share')
    const [top, , bottom] = /padding:\s*(\d+)px (\d+)px (\d+)px/.exec(dialog)!.slice(1).map(Number)
    const head = px(rule('.eb-share-close'), 'height')
    const chrome = 2 * 16 + 2 + top + bottom + head + px(dialog, 'gap')
    expect(chrome).toBe(124)
    expect(css).toContain('--tall: min(100dvh - 124px, 760px)')
    expect(css).toContain('--ph: max(160px, 100dvh - 124px)')
    expect(css).toContain('@media (min-width: 1200px) { .eb-share-scrim { --ctl: 480px; } }')
  })
  it('the tallest column (the collage poster: the size, Arrangement, Count, Goal, two switch pairs, the names note, Export in batches; a status line and the filters line) fits', () => {
    // With a mouse (a laptop): option rows, the title field and the actions are 40px.
    const fine = rule('.eb-share .eb-share-opt, .eb-share-input, .eb-share-actions .eb-btn', '@media (pointer: fine)')
    const row = px(fine, 'min-height')
    expect(row).toBe(40)
    const gap = px(rule('.eb-share-controls', '.eb-share-failed {'), 'gap')
    const optionsGap = px(rule('.eb-share-options'), 'gap')
    const actionsGap = px(rule('.eb-share-actions', '/* The four actions'), 'gap')
    const seg = 44 + 2 * 4 + 2 // the segmented control: a 44px button, 4px padding, 1px border
    expect(rule('.eb-seg-btn', '/* The Story / Post / Square choice')).toMatch(/min-height:\s*44px/)
    expect(rule('.eb-seg', '/* The Story / Post / Square choice')).toMatch(/padding:\s*4px/)
    const optcol = rule('.eb-share-optcol')
    expect(optcol).toMatch(/padding-block:\s*2px/)
    expect(optcol).toMatch(/line-height:\s*1\.25/)
    expect(rule('.eb-share-optnote')).toMatch(/font-size:\s*14px;[^}]*line-height:\s*1\.3/)
    const sizeRow = 2 * 2 + 2 * 2 + 16 * 1.25 + 2 + 14 * 1.3 // row and column padding, the label, the gap, the note line
    const names = rule('.eb-share-names-note')
    expect(names).toMatch(/padding:\s*4px 12px 6px/)
    const namesNote = 4 + 6 + 2 * 14 * 1.5 // two lines of .eb-note (14px, 1.5)
    const group = sizeRow + 6 * row + namesNote + 9 // + Arrangement, Count, Goal, two pairs, Export in batches; 9 hairlines
    const actions = row + actionsGap + row
    const status = 14 * 1.5
    const filters = 36 // .eb-textbtn's height
    const coffee = 32 + 2 * 6 - 6 // the image, its press padding, the negative bottom margin
    const column = seg + gap + row + optionsGap + group + gap + actions + gap + status + gap + filters + gap + coffee
    expect(Math.ceil(column)).toBeLessThanOrEqual(H - 124)
    // The empty status line gives its gap back, so the usual column is shorter still.
    expect(rule('.eb-share-controls > [role="status"]:empty')).toMatch(new RegExp(`margin-top:\\s*-${gap}px`))
  })
  it('the format and orientation row fits on one line at the 480px column', () => {
    // English, the longest of the short ones: Story, Post, Square and Vertical, Horizontal at 16px, 10px padding each.
    expect(rule('.eb-share-toprow .eb-seg-btn')).toMatch(/padding:\s*0 10px/)
  })
})
