// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { dockRowWidth } from '@/components/app/ControlsBar'

// jsdom has no layout: each box gets a fixed offsetWidth, and margins and gaps come from inline styles.
const box = (w: number, style = '', cls = '') => {
  const el = document.createElement('div')
  el.setAttribute('style', style)
  if (cls) el.className = cls
  Object.defineProperty(el, 'offsetWidth', { value: w })
  return el
}

describe('dockRowWidth (the Tree bar: one row while its controls fit)', () => {
  it('adds the views, every control of the Filters group side by side and the magnifier, with gaps and margins', () => {
    const dock = box(900, 'column-gap: 4px')
    const group = box(900, 'column-gap: 4px; margin-left: 300px', 'eb-dock-filters') // its own (auto) margin is left out
    group.append(box(200, 'margin-right: 8px'), box(260, 'margin-right: 8px'), box(120))
    dock.append(box(188), group, box(44, 'margin-left: 8px'), box(500, 'position: absolute'), box(80, 'display: none'))
    // 188 | 200+8 + 4 + 260+8 + 4 + 120 | 8+44, and the dock's two gaps
    expect(dockRowWidth(dock)).toBe(188 + (208 + 4 + 268 + 4 + 120) + 52 + 2 * 4)
  })
})
