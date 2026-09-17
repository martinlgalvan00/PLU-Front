import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CheckInScanResult from '../src/components/admin/CheckInScanResult.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderResult({ validUntil, outcome = 'ready' } = {}) {
  return render(
    <I18nProvider>
      <CheckInScanResult
        canCheckIn
        locale="es-AR"
        onDismiss={() => {}}
        onScanCheckIn={() => {}}
        scanBusy={false}
        scanPersonDoc="30111222"
        scanPersonName="Juana Pérez"
        scanTicketPaid
        scanVerdict={{ Icon: CheckCircle2, tone: 'success' }}
        scanResult={{
          kind: 'ticket',
          outcome,
          canCheckIn: outcome === 'ready',
          status: 'pagada',
          row: {
            id: 'ticket-1',
            type: 'espectador',
            name: 'Juana Pérez',
            document: '30111222',
            ticketTypeName: 'General',
            credentialScopes: ['gate_tickets'],
            status: 'pagada',
            validFrom: '2026-08-15T10:00:00.000Z',
            validUntil,
          },
        }}
      />
    </I18nProvider>,
  )
}

describe('CheckInScanResult: reloj de vigencia', () => {
  it('avisa que vence en un minuto sin bloquear una entrada todavía válida', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'))
    renderResult({ validUntil: '2026-08-15T12:01:00.000Z' })

    expect(screen.getByText(/vence dentro de 1 minuto/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /registrar ingreso/i }).disabled).toBe(false)
  })

  it('pasa a vencido al minuto exacto y bloquea el ingreso local', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'))
    renderResult({ validUntil: '2026-08-15T12:00:01.000Z' })

    act(() => vi.advanceTimersByTime(2_000))

    expect(screen.getByText(/este qr ya venció/i)).toBeTruthy()
    expect(screen.getByText(/venció hace 1 segundo/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /registrar ingreso/i }).disabled).toBe(true)
  })
})
