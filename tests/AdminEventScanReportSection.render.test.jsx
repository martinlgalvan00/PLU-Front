import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminEventScanReportSection from '../src/components/admin/AdminEventScanReportSection.jsx'

afterEach(cleanup)

function renderSection(onGetReport, extraProps = {}) {
  return render(
    <I18nProvider>
      <AdminEventScanReportSection
        eventSlug="pitbull-classic-2026"
        onGetReport={onGetReport}
        {...extraProps}
      />
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
      ticketId: 'ticket-abc-1',
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

  it('no ofrece excepción de acceso sin permiso ni handler', async () => {
    renderSection(async () => REPORT_WITH_DATA)
    await waitFor(() => screen.getByText('Escaneos totales'))
    expect(screen.queryByText('Excepción de acceso')).toBeNull()
  })

  it('no ofrece excepción de acceso para un outcome que no la resuelve', async () => {
    const alreadyUsed = {
      ...REPORT_WITH_DATA,
      recent: [{ ...REPORT_WITH_DATA.recent[0], outcome: 'already_used' }],
    }
    renderSection(async () => alreadyUsed, {
      canManageAccessOverride: true,
      onSetTicketAccessOverride: vi.fn(),
    })
    await waitFor(() => screen.getByText('Escaneos totales'))
    expect(screen.queryByText('Excepción de acceso')).toBeNull()
  })

  it('otorga una excepción de acceso desde una fila vencida', async () => {
    const onSetTicketAccessOverride = vi.fn().mockResolvedValue(undefined)
    renderSection(async () => REPORT_WITH_DATA, {
      canManageAccessOverride: true,
      onSetTicketAccessOverride,
    })
    await waitFor(() => screen.getByText('Escaneos totales'))

    fireEvent.click(screen.getByText('Excepción de acceso'))
    await screen.findByRole('dialog')

    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    const timeInputs = screen.getAllByPlaceholderText('hh:mm')
    fireEvent.change(dateInputs[0], { target: { value: '17/09/2026' } })
    fireEvent.change(timeInputs[0], { target: { value: '10:00' } })
    fireEvent.change(dateInputs[1], { target: { value: '18/09/2026' } })
    fireEvent.change(timeInputs[1], { target: { value: '10:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar excepción' }))

    await waitFor(() => expect(onSetTicketAccessOverride).toHaveBeenCalledTimes(1))
    const [ticketId, payload] = onSetTicketAccessOverride.mock.calls[0]
    expect(ticketId).toBe('ticket-abc-1')
    expect(payload.enabled).toBe(true)
    expect(payload.validFrom).toEqual(expect.any(String))
    expect(payload.validUntil).toEqual(expect.any(String))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
