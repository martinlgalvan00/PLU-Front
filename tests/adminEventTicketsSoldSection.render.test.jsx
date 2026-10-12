import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminEventTicketsSoldSection from '../src/components/admin/AdminEventTicketsSoldSection.jsx'

/**
 * Cobertura de "Entradas vendidas" (capítulo nuevo en Ventas, dentro del
 * workspace del evento): filtro por tipo de entrada y por estado, búsqueda
 * local, export CSV, y que el canal/comprador salgan de `ticket.order`
 * (join nuevo de `staff_list_tickets_for_event`).
 */

const EVENT = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }

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
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {}
  }
})

afterEach(cleanup)

function ticket(overrides = {}) {
  return {
    id: 'tk-1',
    ticketCode: 'TCK-00000001',
    qrToken: 'qr-1',
    orderId: 'ord-1',
    attendeeName: 'Camila Rearte',
    attendeeDni: '30111222',
    ticketTypeId: 'tt-general',
    ticketTypeName: 'General',
    credentialLabel: 'General',
    unitPrice: 15000,
    status: 'pagada',
    checkIn: null,
    order: {
      id: 'ord-1',
      reference: 'TORD-abc123',
      status: 'aprobado',
      provider: 'manual',
      manualPaymentChannel: 'cash_pitbull',
      buyerName: 'Juan Operador',
      buyerEmail: 'juan@example.com',
    },
    ...overrides,
  }
}

function renderSection(props = {}) {
  const fetchTickets = props.fetchTickets ?? vi.fn().mockResolvedValue({ tickets: [] })
  const utils = render(
    <I18nProvider>
      <AdminEventTicketsSoldSection event={EVENT} fetchTickets={fetchTickets} {...props} />
    </I18nProvider>,
  )
  return { ...utils, fetchTickets }
}

describe('AdminEventTicketsSoldSection', () => {
  it('pide las entradas del evento al montar', async () => {
    const fetchTickets = vi.fn().mockResolvedValue({ tickets: [ticket()] })
    renderSection({ fetchTickets })
    await waitFor(() => expect(fetchTickets).toHaveBeenCalledWith('pitbull-classic-2026'))
  })

  it('muestra asistente, DNI, tipo, precio y estado en la fila', async () => {
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets: [ticket()] }) })

    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    expect(screen.getByText('30111222')).toBeTruthy()
    // "General" aparece dos veces: el chip del filtro de tipo y la celda de
    // la tabla -- alcanza con confirmar que la celda está.
    expect(screen.getAllByText('General').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('$ 15.000')).toBeTruthy()
    expect(screen.getByText('Sin ingresar')).toBeTruthy()
  })

  it('el comprador y el canal de pago salen en el panel de la entrada, no en la tabla', async () => {
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets: [ticket()] }) })
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    expect(screen.queryByText('Juan Operador', { exact: false })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /ver qr de camila rearte/i }))

    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText(/Juan Operador/)).toBeTruthy()
    expect(within(panel).getByText('TORD-abc123')).toBeTruthy()
  })

  it('una entrada sin orden asociada no rompe: el panel omite comprador y orden', async () => {
    renderSection({
      fetchTickets: vi.fn().mockResolvedValue({ tickets: [ticket({ order: null })] }),
    })
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /ver qr de camila rearte/i }))

    const panel = screen.getByRole('dialog')
    expect(within(panel).queryByText('Comprador')).toBeNull()
    expect(within(panel).queryByText('Orden')).toBeNull()
  })

  it('el panel muestra el QR y las acciones sólo con la entrada acreditada', async () => {
    const tickets = [
      ticket({ id: 'tk-paid' }),
      ticket({ id: 'tk-unpaid', attendeeName: 'Sin Pagar', status: 'pendiente_pago' }),
    ]
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets }) })
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /ver qr de camila rearte/i }))
    let panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Habilitada')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /descargar qr/i })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /copiar enlace del comprador/i })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /ver qr de sin pagar/i }))
    panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Sin acreditar')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: /descargar qr/i })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /copiar enlace/i })).toBeNull()
  })

  it('la excepción de acceso sólo se ofrece con permiso y reemplaza al panel', async () => {
    const onSetTicketAccessOverride = vi.fn().mockResolvedValue({})
    const fetchTickets = vi.fn().mockResolvedValue({ tickets: [ticket()] })

    const first = renderSection({ fetchTickets, onSetTicketAccessOverride })
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /ver qr de camila rearte/i }))
    expect(screen.queryByRole('button', { name: /excepción de acceso/i })).toBeNull()
    first.unmount()

    renderSection({ fetchTickets, canOverride: true, onSetTicketAccessOverride })
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /ver qr de camila rearte/i }))
    fireEvent.click(screen.getByRole('button', { name: /excepción de acceso/i }))

    // El diálogo reemplaza al panel: no se apilan dos trampas de foco.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /excepción de acceso/i })).toBeTruthy()
  })

  it('resume emitidas, pagadas, ingresaron y sin pagar', async () => {
    const tickets = [
      ticket({ id: 'a', checkIn: { scannedAt: '2026-12-11T14:10:00.000Z' } }),
      ticket({ id: 'b' }),
      ticket({ id: 'c', status: 'pendiente_pago' }),
    ]
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets }) })
    await waitFor(() => expect(screen.getByLabelText('Resumen de entradas')).toBeTruthy())

    const summary = screen.getByLabelText('Resumen de entradas')
    const read = (label) => within(summary).getByText(label).previousElementSibling.textContent
    expect(read('Emitidas')).toBe('3')
    expect(read('Pagadas')).toBe('2')
    expect(read('Ingresaron')).toBe('1')
    expect(read('Sin pagar')).toBe('1')
  })

  it('filtra por tipo de entrada', async () => {
    const tickets = [
      ticket({ id: 'tk-1', ticketTypeId: 'tt-general', ticketTypeName: 'General', credentialLabel: 'General' }),
      ticket({
        id: 'tk-2',
        attendeeName: 'Juan Perez',
        ticketTypeId: 'tt-vip',
        ticketTypeName: 'VIP',
        credentialLabel: 'VIP',
      }),
    ]
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets }) })

    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    expect(screen.getByText('Juan Perez')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^vip/i }))

    expect(screen.queryByText('Camila Rearte')).toBeNull()
    expect(screen.getByText('Juan Perez')).toBeTruthy()
  })

  it('filtra por estado', async () => {
    const tickets = [
      ticket({ id: 'tk-1', status: 'pagada' }),
      ticket({ id: 'tk-2', attendeeName: 'Sin Pagar', status: 'pendiente_pago' }),
    ]
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets }) })

    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^pendientes de pago/i }))

    expect(screen.queryByText('Camila Rearte')).toBeNull()
    expect(screen.getByText('Sin Pagar')).toBeTruthy()
  })

  it('la búsqueda filtra localmente por asistente, DNI, referencia o comprador', async () => {
    const tickets = [
      ticket({ id: 'tk-1' }),
      ticket({
        id: 'tk-2',
        attendeeName: 'Juan Perez',
        attendeeDni: '1',
        order: { ...ticket().order, reference: 'TORD-zzz', buyerName: 'Otro Comprador' },
      }),
    ]
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets }) })

    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Otro Comprador' } })

    expect(screen.queryByText('Camila Rearte')).toBeNull()
    expect(screen.getByText('Juan Perez')).toBeTruthy()
  })

  it('exportar CSV está deshabilitado sin filas y habilitado con resultados', async () => {
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets: [] }) })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exportar csv/i }).disabled).toBe(true),
    )

    cleanup()
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets: [ticket()] }) })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exportar csv/i }).disabled).toBe(false),
    )
  })

  it('un error de carga ofrece reintentar', async () => {
    const fetchTickets = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ tickets: [ticket()] })
    renderSection({ fetchTickets })

    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /reintentar|retry/i }))

    await waitFor(() => expect(fetchTickets).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Camila Rearte')).toBeTruthy())
  })

  it('sin ventas todavía, muestra el estado vacío', async () => {
    renderSection({ fetchTickets: vi.fn().mockResolvedValue({ tickets: [] }) })
    await waitFor(() => expect(screen.getByText('Todavía no hay entradas vendidas')).toBeTruthy())
  })
})
