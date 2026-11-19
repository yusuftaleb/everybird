import { expect, it } from 'vitest'
import { SLOTS, slotSource } from '@/lib/list/model'
import { emptySaved, migrateSaved } from '@/lib/list/storage'
it('provides the parser source slots and adds missing slots to v4 saves', () => {
  expect(SLOTS).toEqual(['ebird', 'ebird-list', 'inat', 'obsorg', 'obsorg-list', 'sheet', 'scythebill', 'manual'])
  expect(slotSource('obsorg-list')).toBe('obsorg')
  const s = emptySaved()
  expect(s.records.obsorg).toEqual([])
  expect(s.records['obsorg-list']).toEqual([])
  const legacy = structuredClone(s)
  Reflect.deleteProperty(legacy.records, 'obsorg')
  Reflect.deleteProperty(legacy.records, 'obsorg-list')
  expect(migrateSaved(legacy)).toEqual(s)
})
