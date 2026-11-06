import { describe, expect, it } from 'vitest'
import { closedPanelLevels, togglePanel } from '@/lib/list/filter-panels'

describe('filter panels (taxonomy always on; Places and Time toggle)', () => {
  it('a toggle opens its panel, tapping it again closes it, and the other one swaps in', () => {
    expect(togglePanel(null, 'places')).toBe('places')
    expect(togglePanel('places', 'places')).toBeNull()
    expect(togglePanel('places', 'time')).toBe('time')
    expect(togglePanel('time', 'time')).toBeNull()
  })
  it('active filters of a closed panel show as removable chips; taxonomy never does (it is always on show)', () => {
    const f = { order: 'Passeriformes', family: 'Corvidae', country: 'CA', from: '2021-05', to: '2021-05', trip: 'CA-2021-05-01' }
    expect(closedPanelLevels(f, null)).toEqual(['country', 'trip']) // a trip stands for its months
    expect(closedPanelLevels(f, 'places')).toEqual(['trip'])
    expect(closedPanelLevels(f, 'time')).toEqual(['country'])
    expect(closedPanelLevels({ order: 'Strigiformes' }, null)).toEqual([])
    expect(closedPanelLevels({ from: '2020-01' }, 'places')).toEqual(['range'])
  })
  it('leaves out hidden panels (a shared link without places or dates)', () => {
    expect(closedPanelLevels({ country: 'CA', to: '2020-03' }, null, ['places'])).toEqual(['range'])
  })
})
