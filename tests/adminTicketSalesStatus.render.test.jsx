import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * La tira de estado existe para que "prendí el switch y no pasa nada" deje de
 * ser el modo normal de operar. Lo que se prueba es que nombre el control que
 * está cortando y dónde se toca, y que una lectura de plataforma caída no la
 * deje muda.
 */

const togglesState = vi.hoisted(() => ({ value: null, shouldFail: false }))

vi.mock('../src/services/platformSettingsAdminService.js', () => ({
  fetchPlatformFeatureToggles: () =>
    togglesState.shouldFail
      ? Promise.reject(new Error('sin conexión'))
      : Promise.resolve(togglesState.value),
}))

const AdminTicketSalesStatus = (await import('../src/components/admin/AdminTicketSalesStatus.jsx'))
  .default

const OPEN_PLATFORM = {
  checkoutEnabled: true,
  ticketEnabled: true,
  environmentHolds: [],
  paymentChannels: {
    ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: false },
  },
}

function draft(overrides = {}) {
  return {
    published: true,
    status: 'inscripcion_abierta',
    pricing: { ticketsEnabled: true },
    ticketSalesOpensAt: '',
    ticketSalesClosesAt: '',
    eventDays: [{ dayIndex: 0, label: 'Día 1' }],
    ticketTypes: [{ id: 'general', name: 'General', price: 20000, active: true }],
    paymentChannelOverrides: null,
    ...overrides,
  }
}

function renderStatus(draftValue, { platform = OPEN_PLATFORM, shouldFail = false } = {}) {
  togglesState.value = platform
  togglesState.shouldFail = shouldFail
  return render(
    <I18nProvider>
      <AdminTicketSalesStatus draft={draftValue} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('AdminTicketSalesStatus', () => {
  it('con todo en orden dice que la venta está abierta y con qué se cobra', async () => {
    renderStatus(draft())
    await waitFor(() => expect(screen.getByText('La venta está abierta')).toBeTruthy())
    expect(screen.getByText(/Mercado Pago/)).toBeTruthy()
  })

  it('nombra el interruptor de plataforma y lo ubica en Finanzas', async () => {
    renderStatus(draft(), { platform: { ...OPEN_PLATFORM, ticketEnabled: false } })
    await waitFor(() => expect(screen.getByText('La venta está cerrada')).toBeTruthy())
    expect(screen.getByText(/pausada para toda la plataforma/)).toBeTruthy()
    expect(document.querySelector('[data-scope="platform"]')).not.toBeNull()
  })

  it('lista todos los motivos, no sólo el primero', async () => {
    renderStatus(draft({ published: false, pricing: { ticketsEnabled: false } }))
    await waitFor(() => expect(screen.getByText('La venta está cerrada')).toBeTruthy())
    expect(document.querySelectorAll('.admin-ticket-sales-status__blockers li')).toHaveLength(2)
  })

  it('sin lectura de plataforma sigue diciendo lo que el editor puede arreglar', async () => {
    renderStatus(draft({ eventDays: [] }), { shouldFail: true })
    await waitFor(() => expect(screen.getByText('La venta está cerrada')).toBeTruthy())
    expect(screen.getByText(/no tiene jornadas cargadas/)).toBeTruthy()
  })
})
