import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useModalDialog from '../src/hooks/useModalDialog.js'

afterEach(cleanup)

function Dialog({ onClose }) {
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })
  return (
    <div ref={panelRef} role="dialog" aria-label="Diálogo" onKeyDown={onKeyDown}>
      <button ref={initialFocusRef} type="button">
        Primero
      </button>
      <input aria-label="Medio" />
      <button type="button">Último</button>
    </div>
  )
}

// jsdom no calcula layout: sin esto `getClientRects()` está vacío y nada cuenta como visible.
function makeVisible() {
  for (const element of document.querySelectorAll('button, input')) {
    element.getClientRects = () => [{}]
  }
}

describe('useModalDialog', () => {
  it('manda el foco al control inicial y lo devuelve a quien abrió el diálogo', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(<Dialog onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primero' }))

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('bloquea el scroll de la página mientras está abierto y lo restituye', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<Dialog onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
    document.body.style.overflow = ''
  })

  it('Escape cierra y no se propaga', () => {
    const onClose = vi.fn()
    const parentKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <Dialog onClose={onClose} />
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('Tab desde el último vuelve al primero, y Shift+Tab desde el primero va al último', () => {
    render(<Dialog onClose={() => {}} />)
    makeVisible()
    const first = screen.getByRole('button', { name: 'Primero' })
    const last = screen.getByRole('button', { name: 'Último' })

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('Tab en el medio no interfiere con el orden natural', () => {
    render(<Dialog onClose={() => {}} />)
    makeVisible()
    const middle = screen.getByLabelText('Medio')
    middle.focus()
    expect(fireEvent.keyDown(middle, { key: 'Tab' })).toBe(true) // no se previno
  })
})
