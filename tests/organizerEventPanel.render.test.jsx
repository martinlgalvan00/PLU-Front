import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPaymentChannelMatrix from '../src/components/admin/event-editor/EventPaymentChannelMatrix.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * Panel de evento de un ORGANIZADOR (cuenta por evento).
 *
 * Ve y edita solo sus eventos. No crea, publica, abre inscripciones, destaca ni toca el
 * aviso del sitio; sus cobros salen del endpoint de SU evento (los listados globales le
 * dan 403); y no puede abrir un medio de pago que PLU tiene cerrado.
 */
const fetchEventPayments = vi.hoisted(() => vi.fn())
const fetchSiteTeaser = vi.hoisted(() => vi.fn())
const listTicketsForEvent = vi.hoisted(() => vi.fn())

vi.mock('../src/services/eventPaymentsService.js', () => ({ fetchEventPayments }))
vi.mock('../src/services/ticketApi.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listTicketsForEvent,
}))
vi.mock('../src/services/siteTeaserService.js', () => ({
  fetchSiteTeaser,
  saveSiteTeaser: vi.fn(),
}))

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  description: 'Fecha nacional de powerlifting.',
  date: '15 ago',
  dateISO: '2026-08-15',
  startsAt: '2026-08-15T12:00:00.000Z',
  endsAt: '2026-08-16T23:00:00.000Z',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 48,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
  ticketTypes: [{ id: 'tt-1', name: 'General', price: 12000, active: true }],
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.IntersectionObserver ??= class {
    constructor(callback) {
      this.callback = callback
    }

    observe() {
      this.callback?.([{ isIntersecting: true }], this)
    }

    disconnect() {}
  }
})

beforeEach(() => {
  fetchSiteTeaser.mockResolvedValue({ eventsEnabled: true })
  listTicketsForEvent.mockResolvedValue({
    tickets: [
      { id: 't1', amountPaid: 12000, checkedInAt: '2026-08-15T14:00:00.000Z' },
      { id: 't2', amountPaid: 12000, checkedInAt: null },
    ],
  })
  fetchEventPayments.mockResolvedValue({
    event: { id: 'evt-1', slug: EVENT.slug },
    summary: null,
    payments: [
      {
        id: 'pay-1',
        athleteId: 'ath-1',
        eventSlug: EVENT.slug,
        status: 'validacion_manual',
        amount: 75000,
        concept: 'registration',
        method: 'manual_link',
        paymentProofPath: 'proofs/a.pdf',
        manualPaymentChannel: 'bank_transfer',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    ],
    athletes: [{ id: 'ath-1', fullName: 'Ana Pérez', documentId: '30111222' }],
    pendingTicketOrders: [
      {
        orderId: 'ord-ok',
        status: 'aprobado',
        provider: 'mercado_pago',
        amount: 12000,
        currency: 'ARS',
        eventSlug: EVENT.slug,
        attendees: [{ name: 'Luis Gómez' }],
        createdAt: '2026-08-02T10:00:00.000Z',
      },
      {
        orderId: 'ord-open',
        status: 'pendiente',
        provider: 'manual',
        manualPaymentChannel: 'bank_transfer',
        paymentProofPath: 'proofs/b.jpg',
        amount: 12000,
        currency: 'ARS',
        eventSlug: EVENT.slug,
        attendees: [{ name: 'Marta Ruiz' }],
        createdAt: '2026-08-03T10:00:00.000Z',
      },
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderEvents(overrides = {}) {
  render(
    <I18nProvider>
      <EventsSection
        adminEvents={[EVENT]}
        canEdit
        canManageUsers={false}
        canManageEventTeam
        canValidatePayments
        eventScoped
        onApprovePayment={vi.fn(async () => ({}))}
        onApproveTicketOrder={vi.fn(async () => ({}))}
        onRejectPayment={vi.fn(async () => ({}))}
        onRejectTicketOrder={vi.fn(async () => ({}))}
        onSaveEvent={vi.fn(async () => ({ event: EVENT, events: [EVENT] }))}
        onListSecurityUsers={async () => []}
        onListSecurityZones={async () => []}
        // Como hace AdminPage con una cuenta por evento: sin acción de estado.
        onSetEventState={undefined}
        // Los listados globales NO llegan (un organizador no los carga).
        payments={[]}
        pendingTicketOrders={[]}
        athletes={[]}
        tickets={[]}
        {...overrides}
      />
    </I18nProvider>,
  )
}

function openWorkspace() {
  fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

const tabRail = (panel) => within(panel).getByRole('tablist', { name: /secciones del evento/i })
const openTab = (panel, name) => fireEvent.click(within(tabRail(panel)).getByRole('tab', { name }))

describe('organizador: lista de eventos', () => {
  it('no ofrece crear, publicar, destacar ni el aviso del sitio', () => {
    renderEvents()
    expect(screen.queryByRole('button', { name: /nuevo evento/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /seleccionar/i })).toBeNull()
    expect(screen.queryByText(/pronto habrá novedades/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /destacar|fijar/i })).toBeNull()
    // Y no pide el aviso del sitio (es global y el servidor se lo niega).
    expect(fetchSiteTeaser).not.toHaveBeenCalled()
  })

  it('sin eventos asignados no invita a crear el primero', () => {
    renderEvents({ adminEvents: [] })
    expect(screen.queryByRole('button', { name: /crear/i })).toBeNull()
  })

  it('la cuenta común conserva todo lo anterior', () => {
    renderEvents({
      eventScoped: false,
      canManageUsers: true,
      onSetEventState: vi.fn(async () => ({ event: EVENT, events: [EVENT] })),
    })
    expect(screen.getByRole('button', { name: /nuevo evento/i })).toBeTruthy()
    expect(fetchSiteTeaser).toHaveBeenCalled()
  })
})

describe('organizador: pestañas del evento', () => {
  it('ve Zonas y seguridad aunque no administre usuarios, y no ve la barra de estado', () => {
    renderEvents()
    const panel = openWorkspace()
    expect(within(tabRail(panel)).getByRole('tab', { name: /zonas y seguridad/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /publicar|abrir inscripciones|ocultar/i })).toBeNull()
  })

  it('sin cobros ni inscripciones, esas pestañas no aparecen y la puerta sí', () => {
    renderEvents({
      canEdit: false,
      canValidatePayments: false,
      showRegistrations: false,
      onApprovePayment: undefined,
      onApproveTicketOrder: undefined,
      onRejectPayment: undefined,
      onRejectTicketOrder: undefined,
    })
    const panel = openWorkspace()
    const rail = tabRail(panel)
    expect(within(rail).queryByRole('tab', { name: /pagos/i })).toBeNull()
    expect(within(rail).queryByRole('tab', { name: /inscripciones/i })).toBeNull()
    expect(within(rail).getByRole('tab', { name: /zonas y seguridad/i })).toBeTruthy()
  })

  it('sin permiso de equipo de puerta, esa pestaña no aparece', () => {
    renderEvents({ canManageEventTeam: false })
    const panel = openWorkspace()
    expect(within(tabRail(panel)).queryByRole('tab', { name: /zonas y seguridad/i })).toBeNull()
  })

  it('Página: el destacado queda bloqueado para el organizador', () => {
    renderEvents()
    const panel = openWorkspace()
    openTab(panel, /^página$/i)
    const region = screen.getByRole('region', { name: 'Evento seleccionado' })

    expect(within(region).getByRole('checkbox', { name: /evento destacado/i }).disabled).toBe(true)
  })
})

describe('organizador: resumen del evento', () => {
  it('recaudación y asistencia salen de las entradas de SU evento, no del snapshot global', async () => {
    // El snapshot global llega vacío (el servidor se lo niega): sin esto el Resumen mostraba ceros.
    renderEvents({ tickets: [] })
    const panel = openWorkspace()
    openTab(panel, /resumen/i)

    await waitFor(() => expect(listTicketsForEvent).toHaveBeenCalledWith(EVENT.slug))
    expect(await screen.findByText(/^2 entradas emitidas$/i)).toBeTruthy()
    expect(screen.getByText(/24\.000/)).toBeTruthy()
  })

  it('una cuenta sin restricción sigue usando el snapshot global y no pide las del evento', () => {
    renderEvents({ eventScoped: false, tickets: [] })
    const panel = openWorkspace()
    openTab(panel, /resumen/i)
    expect(listTicketsForEvent).not.toHaveBeenCalled()
  })
})

describe('organizador: cobros del evento', () => {
  it('lee los cobros del endpoint de SU evento, no de los listados globales', async () => {
    renderEvents()
    const panel = openWorkspace()
    openTab(panel, /pagos/i)

    await waitFor(() => expect(fetchEventPayments).toHaveBeenCalledWith(EVENT.slug))
    expect(await screen.findByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('Marta Ruiz')).toBeTruthy()
  })

  it('solo se acredita lo manual que espera: las aprobadas y las de Mercado Pago no tienen botón', async () => {
    renderEvents()
    const panel = openWorkspace()
    openTab(panel, /pagos/i)
    await screen.findByText('Marta Ruiz')
    // Por defecto se ve "Requieren acción"; las aprobadas están en "Todos".
    fireEvent.click(screen.getByRole('button', { name: /^todos/i }))

    const row = (name) => screen.getByText(name).closest('li')
    expect(within(row('Marta Ruiz')).getByRole('button', { name: /validar/i })).toBeTruthy()
    expect(within(row('Luis Gómez')).queryByRole('button', { name: /validar/i })).toBeNull()
  })

  it('con otro evento abierto no mezcla cobros ni pide los de uno que no está abierto', async () => {
    renderEvents()
    openWorkspace()
    await waitFor(() => expect(fetchEventPayments).not.toHaveBeenCalledWith('otro-evento'))
  })
})

describe('matriz de medios para el organizador', () => {
  const PLATFORM_CLOSED_TRANSFER = {
    registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
    ticket: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
  }

  function renderMatrix(props = {}) {
    const onChange = vi.fn()
    render(
      <I18nProvider>
        <EventPaymentChannelMatrix
          value={null}
          onChange={onChange}
          platform={PLATFORM_CLOSED_TRANSFER}
          {...props}
        />
      </I18nProvider>,
    )
    return onChange
  }

  it('no puede abrir un medio que la plataforma tiene cerrado, y dice por qué', () => {
    renderMatrix({ restrictOpen: true })
    const transfer = screen.getByRole('checkbox', { name: /transferencia · inscripción/i })
    expect(transfer.checked).toBe(false)
    expect(transfer.disabled).toBe(true)
    expect(transfer.title).toMatch(/pedíselo a finanzas/i)
  })

  it('sí puede cerrar uno abierto', () => {
    const onChange = renderMatrix({ restrictOpen: true })
    const mp = screen.getByRole('checkbox', { name: /mercado pago · inscripción/i })
    expect(mp.disabled).toBe(false)
    fireEvent.click(mp)
    expect(onChange).toHaveBeenCalled()
  })

  it('quien administra eventos sin restricción sí puede abrirlo', () => {
    renderMatrix({ restrictOpen: false })
    const transfer = screen.getByRole('checkbox', { name: /transferencia · inscripción/i })
    expect(transfer.disabled).toBe(false)
  })
})
