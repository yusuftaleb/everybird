// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Collage, stickerUrl } from '@/components/collage/Collage'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Box } from '@/lib/layout/pack'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// Synthetic species: three birds, one without a sticker.
const row = (code: string, com: string, to: number, g: number, st = true): SpeciesRow => ({
  code, com, sci: `Avis ${code}`, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g, gSrc: 'avonet', st, ar: 1, q: true,
})
const species = buildSpeciesIndex([
  row('crowa', 'Alpha Crow', 1, 400),
  row('wrenb', 'Beta Wren', 2, 10),
  row('nostk', 'Gamma Nosticker', 3, 50, false),
])
const entry = (code: string): ListEntry => ({ code, heard: false, dead: false, media: false, sources: ['manual'] })
const entries = ['crowa', 'wrenb', 'nostk'].map(entry)

function layoutOf(boxes: Record<string, Box>, mode: 'even' | 'true' = 'even'): StateLayout {
  return { key: `narrow|${mode}|x`, layout: 'narrow', mode, W: 350, H: 400, boxes: new Map(Object.entries(boxes)), scale: 1, base: 20 }
}
const full = layoutOf({ crowa: [10, 10, 80, 80], wrenb: [250, 300, 30, 30], nostk: [200, 40, 40, 40] })

afterEach(() => cleanup())

describe('Collage', () => {
  it('renders one button per entry with accessible name = common name', () => {
    render(<Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={() => {}} />)
    for (const name of ['Alpha Crow', 'Beta Wren', 'Gamma Nosticker']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('hidden birds get data-off and aria-hidden', () => {
    const { rerender, container } = render(
      <Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={() => {}} />,
    )
    const filtered = layoutOf({ crowa: [100, 100, 90, 90] })
    rerender(<Collage entries={entries} species={species} layout={filtered} visible={new Set(['crowa'])} mode="even" onPick={() => {}} />)
    const wren = container.querySelector('[data-code="wrenb"]')!
    const crow = container.querySelector('[data-code="crowa"]')!
    expect(wren).toHaveAttribute('data-off')
    expect(wren).toHaveAttribute('aria-hidden', 'true')
    expect(crow).not.toHaveAttribute('data-off')
    expect(crow).not.toHaveAttribute('aria-hidden')
    // The kept bird moved: its position variables follow the new box, in % of the stage width.
    expect((crow as HTMLElement).style.getPropertyValue('--x')).toBe(String((100 / 350) * 100))
    expect(screen.queryByRole('button', { name: 'Beta Wren' })).toBeNull()
  })

  it('st:false renders the silhouette', () => {
    const { container } = render(
      <Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={() => {}} />,
    )
    const none = container.querySelector('[data-code="nostk"]')!
    expect(none.querySelector('[data-silhouette]')).not.toBeNull()
    expect(none.querySelector('img')).toBeNull()
    const crow = container.querySelector('[data-code="crowa"]')!
    expect(crow.querySelector('img')).not.toBeNull()
    expect(crow.querySelector('[data-silhouette]')).toBeNull()
  })

  it('a sticker that fails to load falls back to the silhouette', () => {
    const { container } = render(
      <Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={() => {}} />,
    )
    const crow = container.querySelector('[data-code="crowa"]')!
    fireEvent.error(crow.querySelector('img')!)
    expect(crow.querySelector('img')).toBeNull()
    expect(crow.querySelector('[data-silhouette]')).not.toBeNull()
  })

  it('one tab stop in taxonomic order; arrows move, Enter picks', () => {
    const onPick = vi.fn()
    render(<Collage entries={[...entries].reverse()} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={onPick} />)
    const crow = screen.getByRole('button', { name: 'Alpha Crow' })
    const wren = screen.getByRole('button', { name: 'Beta Wren' })
    const none = screen.getByRole('button', { name: 'Gamma Nosticker' })
    expect([crow.tabIndex, wren.tabIndex, none.tabIndex]).toEqual([0, -1, -1])
    crow.focus()
    fireEvent.keyDown(crow, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(wren)
    fireEvent.keyDown(wren, { key: 'End' })
    expect(document.activeElement).toBe(none)
    fireEvent.keyDown(none, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(wren)
    // Enter: the keydown itself does not pick; the button's native click (detail 0) does, once.
    fireEvent.keyDown(wren, { key: 'Enter' })
    fireEvent.click(wren, { detail: 0 })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('wrenb')
  })

  it('a screen-reader click (detail 0, no keydown) picks the bird once', () => {
    const onPick = vi.fn()
    render(<Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Beta Wren' }), { detail: 0 })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('wrenb')
  })

  it('Space keydown plus its click picks once', () => {
    const onPick = vi.fn()
    render(<Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={onPick} />)
    const crow = screen.getByRole('button', { name: 'Alpha Crow' })
    fireEvent.keyDown(crow, { key: ' ' })
    fireEvent.keyUp(crow, { key: ' ' })
    fireEvent.click(crow, { detail: 0 })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('crowa')
  })

  it('unmounting cancels running bird animations', () => {
    const cancels: Array<() => void> = []
    const anim = () => { const a = { cancel: vi.fn(), onfinish: null } as unknown as Animation; cancels.push(a.cancel as () => void); return a }
    const orig = HTMLElement.prototype.animate
    HTMLElement.prototype.animate = vi.fn(anim) as unknown as typeof orig
    try {
      const { rerender, unmount } = render(
        <Collage entries={entries} species={species} layout={full} visible={new Set(['crowa', 'wrenb', 'nostk'])} mode="even" onPick={() => {}} />,
      )
      rerender(<Collage entries={entries} species={species} layout={layoutOf({ crowa: [100, 100, 90, 90] })} visible={new Set(['crowa'])} mode="even" onPick={() => {}} />)
      expect(cancels.length).toBeGreaterThan(0)
      unmount()
      for (const c of cancels) expect(c).toHaveBeenCalled()
    } finally {
      HTMLElement.prototype.animate = orig
    }
  })

  it('a filtered view shows only its own count, as /lifelist (no "of <total>")', () => {
    const filtered = layoutOf({ crowa: [100, 100, 90, 90] })
    render(<Collage entries={entries} species={species} layout={filtered} visible={new Set(['crowa'])} mode="even" onPick={() => {}} />)
    expect(screen.getByText('1 species')).toBeInTheDocument()
    expect(screen.queryByText(/ of /)).toBeNull()
  })
})

describe('stickerUrl', () => {
  it('stickerUrl picks 128 vs 384 by cssPx·dpr', () => {
    const base = process.env.NEXT_PUBLIC_STICKER_BASE ?? 'https://yusuftaleb.github.io/everybird-stickers'
    expect(stickerUrl('crowa', 64, 2)).toBe(`${base}/v1/128/crowa.webp`)
    expect(stickerUrl('crowa', 65, 2)).toBe(`${base}/v1/384/crowa.webp`)
    expect(stickerUrl('crowa', 128, 1)).toBe(`${base}/v1/128/crowa.webp`)
    expect(stickerUrl('crowa', 100, 3)).toBe(`${base}/v1/384/crowa.webp`)
  })
})
