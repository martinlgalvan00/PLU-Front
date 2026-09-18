import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { ADMIN_TOAST_EVENT } from '../src/lib/adminToast.js'
import TicketOrdersSection from '../src/pages/admin/TicketOrdersSection.jsx'
import { listTicketOrders } from '../src/services/ticketApi.js'

const EMPTY_TICKET_ORDERS = {
  orders: [],
  counts: {
    pending: 0,
    aprobado: 0,
    rechazado: 0,
    cancelado: 0,
    all: 0,
    openAmount: 0,
  },
}

vi.mock('../src/services/ticketApi.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listTicketOrders: vi.fn().mockResolvedValue({
    orders: [],
    counts: {
      pending: 0,
      aprobado: 0,
      rechazado: 0,
      cancelado: 0,
      all: 0,
      openAmount: 0,
    },
  }),
}))

// notifySuccess/notifyError disparan un CustomEvent que consume un host de
// toasts que no está montado en este render test -- se escucha el evento
// directamente en vez de buscar texto de toast en el DOM.
function captureToasts() {
  const toasts = []
  const handler = (event) => toasts.push(event.detail)
  window.addEventListener(ADMIN_TOAST_EVENT, handler)
  return { toasts, stop: () => window.removeEventListener(ADMIN_TOAST_EVENT, handler) }
}

/**
 * Cobertura del alta manual de ventas de entradas: el botón sólo aparece con
 * permiso de edición, el diálogo arma el payload correcto según el evento y
 * el tipo elegidos, y una venta en efectivo dispara el refresh + el aviso de
 * éxito distinto al de una transferencia (que queda pendiente).
 */

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  }
})

afterEach(() => {
  cleanup()
  listTicketOrders.mockReset()
  listTicketOrders.mockResolvedValue(EMPTY_TICKET_ORDERS)
})

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketOrdersSection
        canEdit
        pendingTicketOrders={[]}
        events={[
          {
            slug: 'pitbull-classic-2026',
            title: 'Pitbull Classic 2026',
            ticketTypes: [
              { id: 'tt-general', name: 'General', active: true },
              { id: 'tt-inactivo', name: 'Descontinuada', active: false },
            ],
          },
        ]}
        {...props}
      />
    </I18nProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /cargar venta manual/i }))
  return within(screen.getByRole('dialog'))
}

describe('TicketOrdersSection · venta manual', () => {
  it('no muestra el botón de alta manual sin permiso de edición', () => {
    renderSection({ canEdit: false })
    expect(screen.queryByRole('button', { name: /cargar venta manual/i })).toBeNull()
  })

  it('sólo ofrece los tipos de entrada activos del evento elegido', () => {
    renderSection()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText(/^Evento$/), {
      target: { value: 'pitbull-classic-2026' },
    })
    const typeOptions = dialog.getAllByRole('option', { name: /general|descontinuada/i })
    expect(typeOptions).toHaveLength(1)
    expect(typeOptions[0].textContent).toBe('General')
  })

  it('efectivo: arma el payload con el canal elegido y avisa que ya se emitió', async () => {
    const onCreateManualTicketOrder = vi
      .fn()
      .mockResolvedValue({ order: { status: 'aprobado' }, approved: true })
    const onRefresh = vi.fn().mockResolvedValue()

    renderSection({ onCreateManualTicketOrder, onRefresh })
    const dialog = openDialog()
    const { toasts, stop } = captureToasts()

    fireEvent.change(dialog.getByLabelText(/^Evento$/), {
      target: { value: 'pitbull-classic-2026' },
    })
    fireEvent.change(dialog.getByLabelText(/^DNI$/), { target: { value: '30111222' } })
    fireEvent.change(dialog.getByLabelText(/tipo de entrada/i), {
      target: { value: 'tt-general' },
    })
    fireEvent.change(dialog.getByLabelText(/email/i), {
      target: { value: 'compra@example.com' },
    })
    // "Nombre y apellido" etiqueta tanto al asistente como al comprador: el
    // primer campo es el del asistente, el último el del comprador.
    const nameInputs = dialog.getAllByLabelText(/nombre y apellido/i)
    fireEvent.change(nameInputs[0], { target: { value: 'Camila Rearte' } })
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: 'Juan Operador' } })

    fireEvent.click(dialog.getByRole('button', { name: /^cargar venta$/i }))

    await waitFor(() => expect(onCreateManualTicketOrder).toHaveBeenCalledTimes(1))
    const [payload] = onCreateManualTicketOrder.mock.calls[0]
    expect(payload.eventSlug).toBe('pitbull-classic-2026')
    expect(payload.manualPaymentChannel).toBe('cash_pitbull')
    expect(payload.attendees).toEqual([
      { fullName: 'Camila Rearte', dni: '30111222', ticketTypeId: 'tt-general' },
    ])
    expect(payload.buyer).toEqual({
      name: 'Juan Operador',
      email: 'compra@example.com',
      phone: undefined,
    })

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(toasts.some((toast) => /entrada emitida y mail enviado/i.test(toast.message))).toBe(
        true,
      ),
    )
    // El diálogo se cierra sólo después de un alta exitosa.
    expect(screen.queryByRole('dialog')).toBeNull()
    stop()
  })

  it('transferencia: manda el canal correcto y avisa que queda pendiente', async () => {
    const onCreateManualTicketOrder = vi
      .fn()
      .mockResolvedValue({ order: { status: 'pendiente' }, approved: false })
    const onRefresh = vi.fn().mockResolvedValue()

    renderSection({ onCreateManualTicketOrder, onRefresh })
    const dialog = openDialog()
    const { toasts, stop } = captureToasts()

    fireEvent.change(dialog.getByLabelText(/^Evento$/), {
      target: { value: 'pitbull-classic-2026' },
    })
    fireEvent.change(dialog.getByLabelText(/^DNI$/), { target: { value: '30111222' } })
    fireEvent.change(dialog.getByLabelText(/tipo de entrada/i), {
      target: { value: 'tt-general' },
    })
    fireEvent.change(dialog.getByLabelText(/email/i), {
      target: { value: 'compra@example.com' },
    })
    const nameInputs = dialog.getAllByLabelText(/nombre y apellido/i)
    fireEvent.change(nameInputs[0], { target: { value: 'Camila Rearte' } })
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: 'Juan Operador' } })

    fireEvent.click(dialog.getByLabelText(/transferencia/i))
    fireEvent.click(dialog.getByRole('button', { name: /^cargar venta$/i }))

    await waitFor(() => expect(onCreateManualTicketOrder).toHaveBeenCalledTimes(1))
    expect(onCreateManualTicketOrder.mock.calls[0][0].manualPaymentChannel).toBe('bank_transfer')

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(toasts.some((toast) => /pendiente de comprobante/i.test(toast.message))).toBe(true),
    )
    stop()
  })

  it('sin elegir evento no envía la venta y marca el error', () => {
    const onCreateManualTicketOrder = vi.fn()
    const dialog = (() => {
      renderSection({ onCreateManualTicketOrder })
      return openDialog()
    })()

    fireEvent.click(dialog.getByRole('button', { name: /^cargar venta$/i }))

    expect(onCreateManualTicketOrder).not.toHaveBeenCalled()
    expect(dialog.getByText(/elegí un evento/i)).toBeTruthy()
  })
})

describe('TicketOrdersSection · filtros', () => {
  it('si no hay cola, abre Todas y guarda el canal en un pill', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [],
      counts: {
        pending: 0,
        aprobado: 3,
        rechazado: 1,
        cancelado: 1,
        all: 5,
        openAmount: 0,
      },
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^todas$/i }).getAttribute('aria-pressed')).toBe(
        'true',
      )
    })
    expect(screen.queryByRole('button', { name: /por validar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^canal$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^transferencia$/i })).toBeNull()
  })

  it('si hay órdenes por validar, se queda en esa cola', async () => {
    listTicketOrders.mockResolvedValue({
      orders: [],
      counts: {
        pending: 2,
        aprobado: 3,
        rechazado: 0,
        cancelado: 0,
        all: 5,
        openAmount: 0,
      },
    })

    renderSection()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /por validar/i }).getAttribute('aria-pressed'),
      ).toBe('true')
    })
    expect(screen.queryByRole('button', { name: /^rechazadas$/i })).toBeNull()
  })
})
