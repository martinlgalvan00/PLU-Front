import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import TicketOrderLookup from '../src/components/ui/TicketOrderLookup.jsx'

/**
 * Recuperar una compra de entradas desde el link del mail, sin sesión: el
 * `?ref=` de la URL precarga el código y el comprador sólo tiene que tipear
 * el mail con el que pagó.
 */

afterEach(cleanup)

function renderLookup(onLookup) {
  return render(
    <I18nProvider>
      <TicketOrderLookup onLookup={onLookup} />
    </I18nProvider>,
  )
}

function setSearch(search) {
  window.history.replaceState({}, '', `/entradas${search}`)
}

beforeEach(() => {
  setSearch('')
})

describe('TicketOrderLookup', () => {
  it('no renderiza nada sin onLookup', () => {
    const { container } = renderLookup(undefined)
    expect(container.textContent).toBe('')
  })

  it('arranca colapsado y se expande al tocar el link', () => {
    renderLookup(vi.fn())
    expect(screen.queryByLabelText('Código de la compra')).toBeNull()
    fireEvent.click(screen.getByText('¿Ya compraste? Buscá tu entrada'))
    expect(screen.getByLabelText('Código de la compra')).toBeTruthy()
  })

  it('llega expandido y con la referencia precargada desde ?ref=', () => {
    setSearch('?ref=TORD-abc123')
    renderLookup(vi.fn())
    expect(screen.getByLabelText('Código de la compra').value).toBe('TORD-abc123')
  })

  it('busca con la referencia y el mail tipeados', async () => {
    const onLookup = vi.fn().mockResolvedValue({ order: { status: 'aprobado' } })
    setSearch('?ref=TORD-abc123')
    renderLookup(onLookup)

    fireEvent.change(screen.getByLabelText('Mail con el que compraste'), {
      target: { value: 'camila@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Buscar mi entrada/ }))

    await waitFor(() =>
      expect(onLookup).toHaveBeenCalledWith('TORD-abc123', 'camila@example.com'),
    )
    // Encontrada y paga: el padre ya va a mostrar el QR, esta pieza no agrega
    // feedback propio.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('avisa cuando la compra existe pero todavía no se acreditó', async () => {
    const onLookup = vi.fn().mockResolvedValue({ order: { status: 'pendiente' } })
    setSearch('?ref=TORD-abc123')
    renderLookup(onLookup)
    fireEvent.change(screen.getByLabelText('Mail con el que compraste'), {
      target: { value: 'camila@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Buscar mi entrada/ }))
    await screen.findByText(/todavía está pendiente de acreditación/)
  })

  it('avisa cuando la compra fue rechazada', async () => {
    const onLookup = vi.fn().mockResolvedValue({ order: { status: 'rechazado' } })
    setSearch('?ref=TORD-abc123')
    renderLookup(onLookup)
    fireEvent.change(screen.getByLabelText('Mail con el que compraste'), {
      target: { value: 'camila@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Buscar mi entrada/ }))
    await screen.findByText(/Esta compra fue rechazada/)
  })

  it('avisa cuando no encuentra ninguna compra (404)', async () => {
    const error = new Error('not found')
    error.status = 404
    const onLookup = vi.fn().mockRejectedValue(error)
    setSearch('?ref=TORD-abc123')
    renderLookup(onLookup)
    fireEvent.change(screen.getByLabelText('Mail con el que compraste'), {
      target: { value: 'nadie@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Buscar mi entrada/ }))
    await screen.findByText('No encontramos una compra con esos datos. Revisá el código y el mail.')
  })
})
