import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PaymentOrderSearch from '../src/components/admin/PaymentOrderSearch.jsx'

/**
 * Buscador cruzado por persona/referencia: entradas y afiliación/inscripción
 * mezcladas en un mismo resultado, sin que Finanzas tenga que saber de
 * antemano en qué cola mirar.
 */

const { searchPaymentOrders } = vi.hoisted(() => ({ searchPaymentOrders: vi.fn() }))

vi.mock('../src/services/paymentService.js', () => ({ searchPaymentOrders }))

afterEach(() => {
  cleanup()
  searchPaymentOrders.mockReset()
})

function renderSearch(onSelectResult) {
  return render(
    <I18nProvider>
      <PaymentOrderSearch onSelectResult={onSelectResult} />
    </I18nProvider>,
  )
}

describe('PaymentOrderSearch', () => {
  it('no busca por debajo del mínimo de caracteres', async () => {
    renderSearch()
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: 'a' },
    })

    expect(screen.getByText('Escribí al menos 2 caracteres.')).toBeTruthy()
    await waitFor(() => expect(searchPaymentOrders).not.toHaveBeenCalled())
  })

  it('mezcla entradas y afiliación/inscripción con su badge de concepto', async () => {
    searchPaymentOrders.mockResolvedValue({
      results: [
        {
          kind: 'ticket',
          concept: 'ticket',
          id: 'ticket-1',
          reference: 'TORD-1',
          amount: 25000,
          currency: 'ARS',
          status: 'pendiente',
          createdAt: '2026-08-12T00:00:00.000Z',
          personName: 'Ana Torres',
          personDetail: 'ana@example.com',
          eventTitle: 'Pitbull Classic 2026',
        },
        {
          kind: 'athlete',
          concept: 'membership',
          id: 'athlete-1',
          reference: 'AFIL-1',
          amount: 15000,
          currency: 'ARS',
          status: 'aprobado',
          createdAt: '2026-08-10T00:00:00.000Z',
          personName: 'Ana Torres',
          personDetail: '30111222',
          eventTitle: null,
        },
      ],
    })
    const onSelectResult = vi.fn()
    renderSearch(onSelectResult)

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: 'ana' },
    })

    await waitFor(() => expect(searchPaymentOrders).toHaveBeenCalledWith('ana'))
    await waitFor(() => expect(screen.getByText('Entrada')).toBeTruthy())
    expect(screen.getByText('Afiliación')).toBeTruthy()
    expect(screen.getAllByText('Ana Torres')).toHaveLength(2)

    fireEvent.click(screen.getByText('TORD-1'))
    expect(onSelectResult).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ticket', reference: 'TORD-1' }),
    )
  })

  it('muestra el estado vacío cuando la búsqueda no encuentra nada', async () => {
    searchPaymentOrders.mockResolvedValue({ results: [] })
    renderSearch()

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), {
      target: { value: 'nadie' },
    })

    await waitFor(() =>
      expect(screen.getByText('No se encontró ningún pago con esa búsqueda.')).toBeTruthy(),
    )
  })
})
