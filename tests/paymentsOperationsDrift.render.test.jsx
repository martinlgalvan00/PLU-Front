import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PaymentsOperationsSection from '../src/pages/admin/PaymentsOperationsSection.jsx'

/**
 * Diagnóstico: un drift no crítico se puede descartar sin borrarlo -- sale
 * de acá y queda en la auditoría con motivo, y vuelve a aparecer si la
 * orden se desalinea de nuevo después de restaurarlo.
 */

const {
  getPaymentOperations,
  dismissPaymentDrift,
  restorePaymentDriftDismissal,
  listPaymentDriftDismissals,
} = vi.hoisted(() => ({
  getPaymentOperations: vi.fn(),
  dismissPaymentDrift: vi.fn(),
  restorePaymentDriftDismissal: vi.fn(),
  listPaymentDriftDismissals: vi.fn(),
}))

vi.mock('../src/services/paymentService.js', () => ({
  getPaymentOperations,
  recoverPaymentOperations: vi.fn(),
  retryPaymentEvent: vi.fn(),
  retryPaymentReconciliation: vi.fn(),
  revalidatePaymentOrder: vi.fn(),
  revalidatePaymentOrders: vi.fn(),
  dismissPaymentDrift,
  restorePaymentDriftDismissal,
  listPaymentDriftDismissals,
}))

vi.mock('../src/services/platformSettingsAdminService.js', () => ({
  fetchPlatformFeatureToggles: vi.fn().mockResolvedValue({
    membershipValidationEnabled: true,
    registrationValidationEnabled: true,
    ticketValidationEnabled: true,
  }),
}))

// Subsecciones ajenas al diagnóstico: se mockean para no arrastrar sus
// propias llamadas a servicios que no vienen al caso acá.
vi.mock('../src/pages/admin/AthletePaymentOrdersSection.jsx', () => ({ default: () => null }))
vi.mock('../src/pages/admin/TicketOrdersSection.jsx', () => ({ default: () => null }))
vi.mock('../src/components/admin/TicketSalesAnalyticsPanel.jsx', () => ({ default: () => null }))
vi.mock('../src/components/admin/PaymentExpiryPanel.jsx', () => ({ default: () => null }))
vi.mock('../src/components/admin/PaymentOrderSearch.jsx', () => ({ default: () => null }))

const OPEN_TICKET_DRIFT = {
  orderId: 'tk-order-1',
  reference: 'TORD-ABC123',
  localStatus: 'cancelado',
  expectedStatus: 'aprobado',
}

function opsResponse(health) {
  return {
    summary: {
      health,
      events: { failed: 0, processing: 0, processed: 0 },
      attempts: { reconciliationPending: 0 },
      subscriptions: { pastDue: 0 },
      updatedAt: null,
    },
    events: [],
    reconciliations: [],
    blockers: [],
    configuration: {
      ready: true,
      provider: 'mercado_pago',
      webhookConfigured: true,
      webhookProcessingMode: 'inline',
      recoveryEnabled: true,
      recoveryIntervalMs: 60000,
    },
  }
}

function driftedHealth() {
  return {
    healthy: false,
    athleteOrderDrift: 0,
    ticketOrderDrift: 1,
    staleEventLocks: 0,
    staleReconciliationLocks: 0,
    exhaustedEvents: 0,
    dismissedDrift: 0,
    openAthleteDrift: [],
    openTicketDrift: [OPEN_TICKET_DRIFT],
    checkedAt: '2026-09-18T00:00:00Z',
  }
}

function cleanHealth() {
  return {
    healthy: true,
    athleteOrderDrift: 0,
    ticketOrderDrift: 0,
    staleEventLocks: 0,
    staleReconciliationLocks: 0,
    exhaustedEvents: 0,
    dismissedDrift: 1,
    openAthleteDrift: [],
    openTicketDrift: [],
    checkedAt: '2026-09-18T00:05:00Z',
  }
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => {
  cleanup()
  getPaymentOperations.mockReset()
  dismissPaymentDrift.mockReset()
  restorePaymentDriftDismissal.mockReset()
  listPaymentDriftDismissals.mockReset()
})

function renderSection() {
  return render(
    <I18nProvider>
      <PaymentsOperationsSection
        canEdit
        pendingTicketOrders={[]}
        ticketEvents={[]}
        onApprovePayment={async () => {}}
        onForceSettlePayment={async () => {}}
        onRejectPayment={async () => {}}
        onApproveTicketOrder={async () => {}}
        onRejectTicketOrder={async () => {}}
        onCreateManualTicketOrder={async () => {}}
      />
    </I18nProvider>,
  )
}

async function openDiagnosticsTab() {
  fireEvent.click(await screen.findByRole('tab', { name: /Diagnóstico/ }))
}

describe('PaymentsOperationsSection — descarte de drift en Diagnóstico', () => {
  it('lista la orden desalineada y descarta el hallazgo con motivo', async () => {
    getPaymentOperations
      .mockResolvedValueOnce(opsResponse(driftedHealth()))
      .mockResolvedValueOnce(opsResponse(cleanHealth()))
    dismissPaymentDrift.mockResolvedValue({ id: 'dismissal-1' })

    renderSection()
    await openDiagnosticsTab()

    await screen.findByText('Orden de entrada TORD-ABC123 desalineada')
    expect(
      screen.getByText('Figura cancelado; el último pago confirmado dice aprobado.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Descartar hallazgo'))

    const input = screen.getByLabelText('Por qué se descarta (queda en la auditoría)')
    const confirmButton = screen.getByRole('button', { name: 'Descartar' })
    expect(confirmButton.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'se' } })
    expect(confirmButton.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'se corrigió a mano' } })
    expect(confirmButton.disabled).toBe(false)

    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(dismissPaymentDrift).toHaveBeenCalledWith(
        'ticket',
        'tk-order-1',
        'se corrigió a mano',
      ),
    )

    // Tras descartar, el diagnóstico vuelve a consultarse y la orden ya no
    // contamina la vista.
    await screen.findByText('Sin hallazgos abiertos. Integridad del ledger sin desvíos.')
    expect(screen.queryByText('Orden de entrada TORD-ABC123 desalineada')).toBeNull()
    expect(getPaymentOperations).toHaveBeenCalledTimes(2)
  })

  it('la auditoría lista lo descartado y permite restaurarlo', async () => {
    getPaymentOperations.mockResolvedValue(opsResponse(cleanHealth()))
    listPaymentDriftDismissals.mockResolvedValue({
      dismissals: [
        {
          id: 'dismissal-1',
          order_kind: 'ticket',
          order_id: 'tk-order-1',
          reference: 'TORD-ABC123',
          reason: 'se corrigió a mano',
          dismissed_at: '2026-09-18T00:05:00Z',
          restored_at: null,
        },
      ],
    })
    restorePaymentDriftDismissal.mockResolvedValue({ id: 'dismissal-1' })

    renderSection()
    await openDiagnosticsTab()
    await screen.findByText('Sin hallazgos abiertos. Integridad del ledger sin desvíos.')

    fireEvent.click(screen.getByRole('button', { name: /Auditoría/ }))

    await screen.findByText('“se corrigió a mano” — 18/9/2026, 00:05')
    const restoreButton = screen.getByRole('button', { name: 'Volver a mostrar' })

    fireEvent.click(restoreButton)

    await waitFor(() =>
      expect(restorePaymentDriftDismissal).toHaveBeenCalledWith('dismissal-1'),
    )
    expect(getPaymentOperations).toHaveBeenCalledTimes(2)
  })
})
