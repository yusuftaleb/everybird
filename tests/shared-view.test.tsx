// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedView, missingFilters } from '@/components/app/SharedView'
import { formatPlace } from '@/lib/import/places'
import { dateToYm, payloadToRecords, ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import { resetCaches } from '@/lib/species/load'

const row = (code: string, to: number, iu?: string) => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g: 1, gSrc: 'family', st: true, ar: 1, q: true, ...(iu ? { iu } : {}) })
const regions = { v: 1 as const, countries: { CA: 'Canada', EG: 'Egypt [x]' }, sub1: { 'CA-BC': 'British Columbia' } }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetCaches() // each test serves its own species file
})

function serve(species: object) {
  vi.stubGlobal('fetch', async (u: string | URL) => {
    const url = String(u)
    const body = url.includes('species.v1') ? species : url.includes('regions.v1') ? regions : null
    return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
  })
}

describe('shared view', () => {
  it('converts months and years both ways', () => {
    expect(dateToYm('2020-03-04')).toEqual({ ym: 1442 })
    expect(dateToYm('2020')).toEqual({ ym: 1440, yearOnly: true })
    expect(dateToYm('junk')).toBeUndefined()
    expect(dateToYm('2921-05-03')).toBeUndefined() // past what a link can carry
    expect(ymToDate(1442)).toBe('2020-03')
    expect(ymToDate(1440, true)).toBe('2020')
  })

  it('rebuilds records with a country and a printable region', () => {
    const p: SharePayload = { v: 1, places: ['Okanagan, British Columbia, Canada', 'Egypt'], countries: ['CA', 'EG'], birds: [{ code: 'a', ym: 1442, p: 0, m: 5 }, { code: 'b', p: 1 }] }
    const { records, regions: shown } = payloadToRecords(p, regions)
    expect(records[0]).toMatchObject({ code: 'a', date: '2020-03', heard: true, media: true, place: { country: 'CA' } })
    expect(records[1].place).toEqual({ country: 'EG' })
    expect(records[0].place!.sub2).toBe('Okanagan')
    expect(shown.sub1[records[0].place!.sub1!]).toBe('British Columbia')
  })

  it('splits a shared place into a province and a county, one province key per name', () => {
    const p: SharePayload = { v: 1, places: ['Okanagan, British Columbia, Canada', 'British Columbia, Canada', 'Sooke, Metchosin, British Columbia, Canada', 'Egypt'], countries: ['CA', 'CA', 'CA', 'EG'],
      birds: [{ code: 'a', p: 0 }, { code: 'b', p: 1 }, { code: 'c', p: 2 }, { code: 'd', p: 3 }] }
    const { records, regions: shown } = payloadToRecords(p, regions)
    const k = records[0].place!.sub1!
    expect(records[0].place).toEqual({ country: 'CA', sub1: k, sub2: 'Okanagan' })
    expect(records[1].place).toEqual({ country: 'CA', sub1: k })
    expect(records[2].place).toEqual({ country: 'CA', sub1: k, sub2: 'Sooke, Metchosin' })
    expect(records[3].place).toEqual({ country: 'EG' })
    expect(shown.sub1[k]).toBe('British Columbia')
    p.places!.forEach((d, i) => expect(formatPlace(records[i].place, shown)).toBe(d))
  })

  it('keeps a place whole when the viewer does not know its country', () => {
    const p: SharePayload = { v: 1, places: ['Okanagan, British Columbia, Narnia'], countries: ['ZZ'], birds: [{ code: 'a', p: 0 }] }
    const { records, regions: shown } = payloadToRecords(p, regions)
    expect(records[0].place!.country).toBe('ZZ')
    expect(records[0].place!.sub2).toBeUndefined()
    expect(records[0].place!.sub1).toMatch(/^ZZ-share\d+$/)
    expect(shown.sub1[records[0].place!.sub1!]).toBe('Okanagan, British Columbia, Narnia')
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
    expect(screen.getByTestId('share-limited').textContent).toBe('This link carries no places or dates, so those filters are left out.')
    // Birds only: no Filters button (by test id or by name), just LifeList's orders row (in the Taxa panel, round 6).
    expect(screen.queryByTestId('filters-button')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull()
    fireEvent.click(screen.getByTestId('taxa-button'))
    expect(screen.getByRole('group', { name: 'Orders' })).toBeTruthy()
    expect(open).not.toHaveBeenCalled()
  })

  it('Status filters a link whose birds have statuses', async () => {
    vi.stubGlobal('innerWidth', 1000)
    serve({ v: 1, species: [row('a', 1, 'LC'), row('b', 2, 'VU'), row('c', 3, 'VU'), row('d', 4, 'EN'), row('e', 5)] })
    render(<SharedView payload={{ v: 1, birds: ['a', 'b', 'c', 'd', 'e'].map((code) => ({ code })) }} />)
    await waitFor(() => expect(screen.getByTestId('collage-stats').textContent).toMatch(/^5 species/))
    expect(screen.getByTestId('collage-stats').textContent).toContain('3 threatened')
    fireEvent.click(screen.getByTestId('filters-button'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Conservation status' })).getByTestId('status-VU'))
    await waitFor(() => expect(screen.getByTestId('collage-stats').textContent).toBe('2 of 5 species · 1 family'))
    expect(screen.getByTestId('chip-status-VU')).toBeTruthy()
    expect(screen.getByTestId('filters-button').getAttribute('aria-label')).toMatch(/^Filters, 1 in use: Conservation status: Vulnerable$/)
  })

  it('no Filters button on a link whose birds have no status (it carries no places or dates either)', async () => {
    serve({ v: 1, species: [row('a', 1), row('b', 2)] })
    render(<SharedView payload={{ v: 1, birds: [{ code: 'a' }, { code: 'b' }] }} />)
    await waitFor(() => expect(screen.getByTestId('collage-stats').textContent).toContain('2 species'))
    expect(screen.queryByTestId('filters-button')).toBeNull()
    expect(screen.getByTestId('collage-stats').textContent).not.toContain('threatened')
  })
})
