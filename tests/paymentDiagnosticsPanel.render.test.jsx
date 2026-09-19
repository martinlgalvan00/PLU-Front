import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import es from '../src/i18n/locales/es.js'
import { translate } from '../src/i18n/translate.js'
import PaymentDiagnosticsPanel from '../src/components/admin/PaymentDiagnosticsPanel.jsx'

/**
 * Diagnóstico: se mudó de la pestaña "Ledger" de Cobros a su propia pestaña
 * dentro de Auditoría (`AuditSection`). Vive siempre en español -- igual que
 * el resto de Auditoría -- así que `t` se resuelve contra el diccionario fijo
 * en vez de `useI18n()`. El provider igual hace falta como ancestro: lo usan
 * `LoadingState`/`ErrorState` para su propio copy genérico.
 */

const t = (key, vars) => translate(es, key, vars)

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

// `LoadingState`/`ErrorState` llaman a `useI18n()` para su propio copy
// genérico, aunque el panel les pase su `t` fijo en español -- necesitan
// el provider como ancestro igual que en `AuditSection`.
function renderPanel(props) {
  return render(
    <I18nProvider>
      <PaymentDiagnosticsPanel t={t} {...props} />
    </I18nProvider>,
  )
}

describe('PaymentDiagnosticsPanel — Diagnóstico dentro de Auditoría', () => {
  it('lista la orden desalineada y descarta el hallazgo con motivo', async () => {
    getPaymentOperations
      .mockResolvedValueOnce(opsResponse(driftedHealth()))
      .mockResolvedValueOnce(opsResponse(cleanHealth()))
    dismissPaymentDrift.mockResolvedValue({ id: 'dismissal-1' })

    renderPanel({ canEdit: true })

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

    await screen.findByText('Sin hallazgos abiertos. Integridad del ledger sin desvíos.')
    expect(screen.queryByText('Orden de entrada TORD-ABC123 desalineada')).toBeNull()
    expect(getPaymentOperations).toHaveBeenCalledTimes(2)
  })

  it('sin permiso de edición no ofrece descartar', async () => {
    getPaymentOperations.mockResolvedValue(opsResponse(driftedHealth()))

    renderPanel({ canEdit: false })

    await screen.findByText('Orden de entrada TORD-ABC123 desalineada')
    expect(screen.queryByLabelText('Descartar hallazgo')).toBeNull()
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

    renderPanel({ canEdit: true })
    await screen.findByText('Sin hallazgos abiertos. Integridad del ledger sin desvíos.')

    fireEvent.click(screen.getByRole('button', { name: /Auditoría/ }))

    await screen.findByText('Orden de entrada TORD-ABC123 desalineada')
    expect(screen.getByText(/se corrigió a mano/)).toBeTruthy()
    const restoreButton = screen.getByRole('button', { name: 'Volver a mostrar' })

    fireEvent.click(restoreButton)

    await waitFor(() =>
      expect(restorePaymentDriftDismissal).toHaveBeenCalledWith('dismissal-1'),
    )
    expect(getPaymentOperations).toHaveBeenCalledTimes(2)
  })
})
