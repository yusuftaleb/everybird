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
    const f = { order: 'Passeriformes', family: 'Corvidae', country: 'CA', year: '2021', trip: 'CA-2021-05-01' }
    expect(closedPanelLevels(f, null)).toEqual(['country', 'year', 'trip'])
    expect(closedPanelLevels(f, 'places')).toEqual(['year', 'trip'])
    expect(closedPanelLevels(f, 'time')).toEqual(['country'])
    expect(closedPanelLevels({ order: 'Strigiformes' }, null)).toEqual([])
    expect(closedPanelLevels({ year: '2020' }, 'places')).toEqual(['year'])
  })
  it('leaves out hidden panels (a shared link without places or dates)', () => {
    expect(closedPanelLevels({ country: 'CA', year: '2020' }, null, ['places'])).toEqual(['year'])
  })
})
