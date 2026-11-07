// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shortDate } from '@/components/import/SourceLine'
import { SourceMenu } from '@/components/import/SourceMenu'

afterEach(cleanup)

describe('SourceMenu: a source row’s ⋯ menu button', () => {
  const setup = () => {
    const refresh = vi.fn()
    const remove = vi.fn()
    render(<SourceMenu label="More for iNaturalist" items={[{ label: 'Refresh', onSelect: refresh }, { label: 'Change username', onSelect: () => {} }, { label: 'Remove', danger: true, keepFocus: true, onSelect: remove }]} />)
    return { btn: screen.getByRole('button', { name: 'More for iNaturalist' }), refresh, remove }
  }

  it('is a menu button; ArrowDown opens on the first item, the arrows wrap, Home/End jump, Escape closes back to the button', () => {
    const { btn } = setup()
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(btn, { key: 'ArrowDown' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'More for iNaturalist' })
    expect(btn).toHaveAttribute('aria-controls', menu.id)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(items[2]).toHaveFocus()
    expect(items[2]).toHaveAttribute('data-danger')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(items[2]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(btn).toHaveFocus()
  })

  it('ArrowUp opens on the last item; picking closes the menu and runs the item; a press outside closes it', () => {
    const { btn, refresh, remove } = setup()
    fireEvent.keyDown(btn, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(remove).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refresh' }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(btn).toHaveFocus()
    fireEvent.click(btn)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('shortDate', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  it('leaves the year off this year’s dates', () => {
    expect(shortDate('2026-11-06T10:00:00Z', now)).toBe('6 Nov')
    expect(shortDate('2025-03-01T10:00:00Z', now)).toBe('1 Mar 2025')
    expect(shortDate('nope', now)).toBeNull()
    expect(shortDate(undefined, now)).toBeNull()
  })
})
