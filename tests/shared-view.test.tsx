// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedView, missingFilters } from '@/components/app/SharedView'
import { dateToYm, payloadToRecords, ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'

const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g: 1, gSrc: 'family', st: true, ar: 1, q: true })
const regions = { v: 1 as const, countries: { CA: 'Canada', EG: 'Egypt [x]' }, sub1: { 'CA-BC': 'British Columbia' } }

afterEach(() => vi.unstubAllGlobals())

describe('shared view', () => {
  it('converts months and years both ways', () => {
    expect(dateToYm('2020-03-04')).toEqual({ ym: 1442 })
    expect(dateToYm('2020')).toEqual({ ym: 1440, yearOnly: true })
    expect(dateToYm('junk')).toBeUndefined()
    expect(ymToDate(1442)).toBe('2020-03')
    expect(ymToDate(1440, true)).toBe('2020')
  })

  it('rebuilds records with a country and a printable region', () => {
    const p: SharePayload = { v: 1, places: ['Okanagan, British Columbia, Canada', 'Egypt'], countries: ['CA', 'EG'], birds: [{ code: 'a', ym: 1442, p: 0, m: 5 }, { code: 'b', p: 1 }] }
    const { records, regions: shown } = payloadToRecords(p, regions)
    expect(records[0]).toMatchObject({ code: 'a', date: '2020-03', heard: true, media: true, place: { country: 'CA' } })
    expect(records[1].place).toEqual({ country: 'EG' })
    expect(shown.sub1[records[0].place!.sub1!]).toBe('Okanagan, British Columbia')
  })

  it('knows which filters a link lacks', () => {
    expect(missingFilters({ v: 1, birds: [{ code: 'a' }] })).toEqual({ places: true, dates: true })
    expect(missingFilters({ v: 1, birds: [{ code: 'a', ym: 3 }] })).toEqual({ places: true, dates: false })
  })

  it('renders from the payload alone and never touches storage', async () => {
    const species = { v: 1, species: [row('a', 1), row('b', 2)] }
    vi.stubGlobal('fetch', async (u: string | URL) => {
      const url = String(u)
      const body = url.includes('species.v1') ? species : url.includes('regions.v1') ? regions : null
      return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
    })
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })
    render(<SharedView payload={{ v: 1, birds: [{ code: 'a' }, { code: 'b' }] }} />)
    await waitFor(() => expect(screen.getByTestId('collage-stats').textContent).toContain('2 species'))
    expect(screen.getByTestId('share-limited').textContent).toBe("Place and date filters aren't available for this link.")
    expect(screen.queryByTestId('filter-tab-places')).toBeNull()
    expect(screen.queryByTestId('filter-tab-time')).toBeNull()
    expect(screen.getByTestId('filter-tab-birds')).toBeTruthy()
    expect(open).not.toHaveBeenCalled()
  })
})
