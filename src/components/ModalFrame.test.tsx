import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModalFrame } from './ModalFrame'

describe('modal keyboard behavior', () => {
  it('keeps keyboard focus inside and restores the trigger on Escape', () => {
    function Example() {
      const [open, setOpen] = useState(false)
      return <><button onClick={() => setOpen(true)}>Open</button>{open ? <ModalFrame labelledBy="test-modal" onClose={() => setOpen(false)}><h2 id="test-modal">Test modal</h2><button>First</button><button>Last</button></ModalFrame> : null}</>
    }
    render(<Example />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    fireEvent.click(trigger)
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('does not dismiss while a persistence operation is busy', () => {
    const close = vi.fn()
    render(<ModalFrame labelledBy="busy-modal" busy onClose={close}><h2 id="busy-modal">Busy</h2><button disabled>Saving</button></ModalFrame>)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(close).not.toHaveBeenCalled()
  })
})
