// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Marks, MARKS } from '@/components/collage/Marks'
import { fromJson, toJson } from '@/lib/list/export'
import type { ListEntry } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { decodeShare, encodeShare } from '@/lib/share/link'

afterEach(cleanup)

describe('photo-or-recording mark is hidden but the data survives', () => {
  const e: ListEntry = { code: 'a', heard: true, dead: false, media: true, sources: ['manual'] }

  it('the marks list and renderer never show the circle', () => {
    expect(MARKS.map((m) => m.sym)).toEqual(['*', '†'])
    const { container } = render(<Marks entry={e} />)
    expect(container).not.toHaveTextContent('◦')
    expect(container).not.toHaveTextContent(/photo or recording/i)
    expect(container.querySelector('.eb-mark')).toHaveTextContent('*')
  })

  it('media still round-trips through the backup JSON', () => {
    const saved = {
      v: 1,
      records: { ebird: [{ code: 'a', media: true }], 'ebird-list': [], inat: [], manual: [] },
      unmatched: [],
      edits: { removed: [], added: [{ code: 'b', media: true }], marks: { a: { media: true } }, fixes: {} },
      rules: { hideHeard: false, hideDead: false, researchOnly: false },
      savedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Saved
    const back = fromJson(toJson(saved))
    expect(back.records.ebird[0].media).toBe(true)
    expect(back.edits.added[0].media).toBe(true)
    expect(back.edits.marks.a.media).toBe(true)
  })

  it('media still round-trips through share encode/decode', () => {
    const { token } = encodeShare({ v: 1, birds: [{ code: 'ostric2', m: 5 }] })
    expect(decodeShare(token).birds[0].m).toBe(5)
  })
})
