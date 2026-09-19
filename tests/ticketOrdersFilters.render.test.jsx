import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Cobertura de los filtros de órdenes de entradas (`TicketOrdersSection`):
 * qué estado/canal pide al servidor cada chip, el auto-ensanche de
 * "Por validar" vacío a "Todas", que una elección manual del operador quede
 * firme, y que la búsqueda sea local sobre lo ya cargado (no un pedido
 * nuevo al servidor).
 */

const listTicketOrders = vi.fn()

vi.mock('../src/services/ticketApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, listTicketOrders: (...args) => listTicketOrders(...args) }
})

const TicketOrdersSection = (await import('../src/pages/admin/TicketOrdersSection.jsx')).default

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

afterEach(() => {
  cleanup()
  listTicketOrders.mockReset()
})

function order(overrides = {}) {
  return {
    orderId: 'ord-1',
    reference: 'TORD-abc123',
    amount: 15000,
    currency: 'ARS',
    status: 'pendiente',
    provider: 'manual',
    manualPaymentChannel: 'bank_transfer',
    paymentProofPath: null,
    paymentProofUploadedAt: null,
    createdAt: '2026-03-01T12:00:00.000Z',
    eventSlug: 'pitbull-classic-2026',
    eventTitle: 'Pitbull Classic 2026',
    ticketCount: 1,
    attendees: [{ name: 'Camila Rearte', dni: '30111222' }],
    buyerEmail: 'compra@example.com',
    ...overrides,
  }
}

function countsFixture(overrides = {}) {
  return {
    pending: 1,
    aprobado: 0,
    rechazado: 0,
    cancelado: 0,
    all: 1,
    ...overrides,
  }
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketOrdersSection canEdit events={[]} pendingTicketOrders={[]} {...props} />
    </I18nProvider>,
  )
}

describe('TicketOrdersSection · filtros', () => {
  it('arranca en "Por validar" y pide al servidor sólo los estados abiertos, ordenados por antigüedad', async () => {
    listTicketOrders.mockResolvedValue({ orders: [order()], counts: countsFixture() })
    renderSection()

    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(1))
    const [params] = listTicketOrders.mock.calls[0]
    expect(params.statuses).toEqual(['creado', 'pendiente'])
    expect(params.channel).toBeUndefined()
    expect(params.sort).toBe('aging')
    expect(params.withCounts).toBe(true)
  })

  it('elegir "Aprobadas" pide ese estado al servidor y ordena por más recientes', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [order()],
      counts: countsFixture({ pending: 1, aprobado: 3, all: 4 }),
    })
    renderSection()
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(1))

    listTicketOrders.mockResolvedValue({
      orders: [order({ status: 'aprobado' })],
      counts: countsFixture({ pending: 1, aprobado: 3, all: 4 }),
    })
    fireEvent.click(screen.getByRole('button', { name: /^aprobadas/i }))

    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(2))
    const [params] = listTicketOrders.mock.calls[1]
    expect(params.statuses).toEqual(['aprobado'])
    expect(params.sort).toBe('recent')
  })

  it('sin nada pendiente pero con órdenes en otros estados, ensancha sola a "Todas"', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [order({ status: 'aprobado' })],
      counts: countsFixture({ pending: 0, aprobado: 5, all: 5 }),
    })
    renderSection()

    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(2))
    const [firstParams] = listTicketOrders.mock.calls[0]
    const [secondParams] = listTicketOrders.mock.calls[1]
    expect(firstParams.statuses).toEqual(['creado', 'pendiente'])
    expect(secondParams.statuses).toBeUndefined() // "Todas" no manda filtro de estado
  })

  it('una vez que el operador elige un estado a mano, no se lo pisa el auto-ensanche', async () => {
    // Arranca con pendientes > 0: el auto-ensanche no tiene motivo para
    // disparar en la carga inicial.
    listTicketOrders.mockResolvedValue({
      orders: [order()],
      counts: countsFixture({ pending: 2, aprobado: 3, all: 5 }),
    })
    renderSection()
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(1))

    // La propia respuesta de "Aprobadas" ya trae `pending: 0` (se validaron
    // las dos transferencias mientras tanto). El auto-ensanche sólo mira
    // `status === 'pending'` -- una vez que el operador se movió a otro
    // estado a mano, ese efecto queda inerte sin importar qué digan los
    // contadores nuevos: no hay un tercer pedido saltando de vuelta a "Todas".
    listTicketOrders.mockResolvedValue({
      orders: [order({ status: 'aprobado' })],
      counts: countsFixture({ pending: 0, aprobado: 3, all: 3 }),
    })
    fireEvent.click(screen.getByRole('button', { name: /^aprobadas/i }))
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(2))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listTicketOrders).toHaveBeenCalledTimes(2)
    expect(listTicketOrders.mock.calls.at(-1)[0].statuses).toEqual(['aprobado'])
  })

  it('elegir un canal manda el filtro de canal al servidor', async () => {
    listTicketOrders.mockResolvedValue({ orders: [order()], counts: countsFixture() })
    renderSection()
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(1))

    listTicketOrders.mockResolvedValue({ orders: [order()], counts: countsFixture() })
    fireEvent.click(screen.getByRole('button', { name: /^efectivo$/i }))

    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(2))
    expect(listTicketOrders.mock.calls.at(-1)[0].channel).toBe('cash_pitbull')
  })

  it('la búsqueda filtra localmente por referencia, evento, asistente o email sin volver a pedir al servidor', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [
        order({ orderId: 'ord-1', reference: 'TORD-aaa', eventTitle: 'Pitbull Classic 2026' }),
        order({
          orderId: 'ord-2',
          reference: 'TORD-bbb',
          eventTitle: 'PLU Open 2026',
          attendees: [{ name: 'Juan Perez', dni: '1' }],
        }),
      ],
      counts: countsFixture({ pending: 2, all: 2 }),
    })
    renderSection()
    await waitFor(() => expect(screen.getByText('TORD-aaa')).toBeTruthy())
    expect(screen.getByText('TORD-bbb')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'PLU Open' } })

    expect(screen.queryByText('TORD-aaa')).toBeNull()
    expect(screen.getByText('TORD-bbb')).toBeTruthy()
    // No dispara un nuevo pedido al servidor: es un filtro local.
    expect(listTicketOrders).toHaveBeenCalledTimes(1)
  })

  it('"ver todas las ventas" en el estado vacío filtrado vuelve canal a "Todos"', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [order({ manualPaymentChannel: 'bank_transfer' })],
      counts: countsFixture(),
    })
    renderSection()
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(1))

    listTicketOrders.mockResolvedValue({ orders: [], counts: countsFixture({ pending: 1, all: 1 }) })
    fireEvent.click(screen.getByRole('button', { name: /^wise$/i }))
    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(2))

    expect(screen.getByText('Ninguna orden coincide con estos filtros.')).toBeTruthy()
    listTicketOrders.mockResolvedValue({ orders: [order()], counts: countsFixture() })
    fireEvent.click(screen.getByRole('button', { name: /ver todas las ventas/i }))

    await waitFor(() => expect(listTicketOrders).toHaveBeenCalledTimes(3))
    const [params] = listTicketOrders.mock.calls.at(-1)
    expect(params.statuses).toBeUndefined()
    expect(params.channel).toBeUndefined()
  })
})
