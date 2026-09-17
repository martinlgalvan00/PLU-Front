import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminEventScanReportSection from '../src/components/admin/AdminEventScanReportSection.jsx'

afterEach(cleanup)

function renderSection(onGetReport) {
  return render(
    <I18nProvider>
      <AdminEventScanReportSection eventSlug="pitbull-classic-2026" onGetReport={onGetReport} />
    </I18nProvider>,
  )
}

const REPORT_WITH_DATA = {
  summary: {
    total: 5,
    admitted: 3,
    rejected: 2,
    byOutcome: [
      { outcome: 'checked_in', count: 3 },
      { outcome: 'expired', count: 2 },
    ],
  },
  byGate: [],
  byHour: [],
  repeated: [
    {
      qrFingerprint: 'fingerprint-abc',
      attempts: 3,
      gates: ['Puerta norte'],
      outcomes: ['expired'],
      firstAt: '2026-08-15T14:00:00.000Z',
      lastAt: '2026-08-15T14:10:00.000Z',
      ticketCode: 'TCK-1',
      credentialLabel: 'Entrada general',
    },
  ],
  recent: [
    {
      id: 'evt-1',
      scannedAt: '2026-08-15T14:10:00.000Z',
      outcome: 'expired',
      kind: 'ticket',
      evidence: 'server',
      gate: 'Puerta norte',
      zoneScope: 'gate_tickets',
      offline: false,
      ticketCode: 'TCK-1',
      credentialLabel: 'Entrada general',
      ticketTypeName: 'Público general — Día 1',
    },
  ],
}

describe('AdminEventScanReportSection', () => {
  it('muestra el estado vacío cuando todavía no hubo escaneos', async () => {
    renderSection(async () => ({
      summary: { total: 0, admitted: 0, rejected: 0, byOutcome: [] },
      byGate: [],
      byHour: [],
      repeated: [],
      recent: [],
    }))

    await screen.findByText('Todavía no hay escaneos')
  })

  it('muestra los contadores y el detalle de rechazos repetidos con datos', async () => {
    renderSection(async () => REPORT_WITH_DATA)

    await waitFor(() => screen.getByText('Escaneos totales'))
    screen.getByText('QR con rechazos repetidos')
    screen.getByText('3 intentos · Puerta norte')
    expect(screen.getAllByText('Entrada general').length).toBeGreaterThan(0)
  })

  it('muestra el aviso de conexión cuando el pedido falla', async () => {
    const error = new Error('sin conexión')
    error.status = 0
    renderSection(async () => {
      throw error
    })

    await screen.findByText('El servicio de administración está desconectado')
  })

  it('nunca renderiza un DNI aunque el informe lo incluyera por error', async () => {
    const poisoned = {
      ...REPORT_WITH_DATA,
      recent: [
        {
          ...REPORT_WITH_DATA.recent[0],
          // El backend nunca debería mandar esto -- si algún día lo hiciera
          // por un bug, el componente no debe pintarlo en ninguna columna.
          attendeeDni: '30111222',
        },
      ],
    }
    renderSection(async () => poisoned)

    await waitFor(() => screen.getByText('Escaneos totales'))
    expect(screen.queryByText('30111222')).toBeNull()
  })

  it('no pide nada si falta eventSlug u onGetReport', () => {
    const onGetReport = vi.fn()
    render(
      <I18nProvider>
        <AdminEventScanReportSection eventSlug={null} onGetReport={onGetReport} />
      </I18nProvider>,
    )
    expect(onGetReport).not.toHaveBeenCalled()
  })
})
