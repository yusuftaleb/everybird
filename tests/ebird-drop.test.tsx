// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EbirdDrop } from '@/components/import/EbirdDrop'

const idle = { busy: false, rows: 0, error: null }
const note = () => screen.queryByTestId('ebird-detail')
afterEach(cleanup)

describe('EbirdDrop: what each eBird file brings', () => {
  it('only the life list download: says it stops at the province and the full export adds the county', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} />)
    expect(note()).toHaveTextContent(/state or province.*Download My Data.*region \(county\)/)
  })
  it('a full-export slot with no county anywhere: one line suggesting to import "Download My Data" again', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0, fullCounty: false }} />)
    expect(note()).toHaveTextContent('No regions (counties) in your eBird file yet: import “Download My Data” again to add them.')
  })
  it('a full export with counties: no note at all', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0, fullCounty: true }} />)
    expect(note()).toBeNull()
  })
})
