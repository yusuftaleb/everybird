// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/ConfirmDialog'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** A dialog underneath (as Add birds) with its own Esc, and the question opened from a button inside it. */
function Stacked({ onYes, onParentEsc }: { onYes: () => void; onParentEsc: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <div role="dialog" aria-label="Under" onKeyDown={(e) => { if (e.key === 'Escape') onParentEsc() }}>
      <button type="button" onClick={() => setAsking(true)}>More</button>
      {asking && <ConfirmDialog ask="Remove it?" yes="Yes, remove it" keep="Keep it" onYes={() => { setAsking(false); onYes() }} onKeep={() => setAsking(false)} />}
    </div>
  )
}

describe('ConfirmDialog', () => {
  const open = () => {
    const onYes = vi.fn(), onParentEsc = vi.fn()
    render(<Stacked onYes={onYes} onParentEsc={onParentEsc} />)
    const more = screen.getByRole('button', { name: 'More' })
    more.focus()
    fireEvent.click(more)
    return { more, onYes, onParentEsc, ask: screen.getByRole('alertdialog', { name: 'Remove it?' }) }
  }

  it('is a modal alertdialog named by its question, outside the dialog under it, focus on the action', () => {
    const { ask } = open()
    expect(ask).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog', { name: 'Under' })).not.toContainElement(ask)
    expect(screen.getByRole('button', { name: 'Yes, remove it' })).toHaveFocus()
    expect(ask).not.toHaveClass('eb-sheet')
  })

  it('Esc keeps and never reaches the dialog underneath; focus goes back to the opener', () => {
    const { more, onYes, onParentEsc } = open()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onParentEsc).not.toHaveBeenCalled()
    expect(onYes).not.toHaveBeenCalled()
    expect(more).toHaveFocus()
  })

  it('Keep and a press on the scrim keep; a press on the card does not; Yes runs the action', () => {
    const { more, onYes, ask } = open()
    fireEvent.pointerDown(ask)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.pointerDown(ask.parentElement!)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(more).toHaveFocus()
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(onYes).toHaveBeenCalledOnce()
  })

  it('keeps Tab inside', () => {
    open()
    const yes = screen.getByRole('button', { name: 'Yes, remove it' }), keep = screen.getByRole('button', { name: 'Keep it' })
    keep.focus()
    fireEvent.keyDown(keep, { key: 'Tab' })
    expect(yes).toHaveFocus()
    fireEvent.keyDown(yes, { key: 'Tab', shiftKey: true })
    expect(keep).toHaveFocus()
  })

  it('is the bottom sheet on a phone', () => {
    vi.stubGlobal('innerWidth', 390)
    const { ask } = open()
    expect(ask).toHaveClass('eb-sheet')
    expect(ask.parentElement).toHaveAttribute('data-sheet')
  })
})
