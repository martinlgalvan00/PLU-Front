import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

    expect(screen.getByText(/credencial vencida/i)).toBeTruthy()
    expect(screen.getByText(/venció hace 1 segundo/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /registrar ingreso/i }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /forzar ingreso/i })).toBeNull()
  })

  it('ofrece forzar este ingreso cuando la entrada paga está vencida', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T13:00:00.000Z'))
    render(
      <I18nProvider>
        <CheckInScanResult
          canCheckIn
          canForceCheckIn
          locale="es-AR"
          onDismiss={() => {}}
          onForceCheckIn={() => {}}
          onScanCheckIn={() => {}}
          scanBusy={false}
          scanPersonDoc="30111222"
          scanPersonName="Juana Pérez"
          scanTicketPaid
          scanVerdict={{ Icon: CheckCircle2, tone: 'success' }}
          scanResult={{
            kind: 'ticket',
            outcome: 'expired',
            canCheckIn: false,
            status: 'pagada',
            row: {
              status: 'pagada',
              validFrom: '2026-08-15T10:00:00.000Z',
              validUntil: '2026-08-15T12:00:00.000Z',
            },
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /forzar ingreso/i })).toBeTruthy()
  })

  it('ofrece habilitar una entrada que todavía no está paga', () => {
    render(
      <I18nProvider>
        <CheckInScanResult
          canCheckIn
          canEnableTickets
          locale="es-AR"
          onDismiss={() => {}}
          onEnableTicket={() => {}}
          onRejectTicket={() => {}}
          onScanCheckIn={() => {}}
          scanBusy={false}
          scanPersonDoc="30111222"
          scanPersonName="Juana Pérez"
          scanTicketPaid={false}
          scanVerdict={{ Icon: CheckCircle2, tone: 'warning' }}
          scanResult={{
            kind: 'ticket',
            outcome: 'not_ready',
            canCheckIn: false,
            status: 'pendiente_pago',
            row: { status: 'pendiente_pago', orderId: 'order-1' },
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /habilitar entrada/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /forzar ingreso/i })).toBeNull()
  })
})

describe('CheckInScanResult: quiosco de molinete', () => {
  it('no pide confirmación y reenvía el pulso sin otro ingreso', () => {
    const onScanCheckIn = vi.fn()
    const onRetryTurnstile = vi.fn()
    render(
      <I18nProvider>
        <CheckInScanResult
          canCheckIn
          kiosk
          locale="es-AR"
          onDismiss={() => {}}
          onRetryTurnstile={onRetryTurnstile}
          onScanCheckIn={onScanCheckIn}
          scanBusy={false}
          scanPersonDoc="30111222"
          scanPersonName="Juana Pérez"
          scanTicketPaid
          scanVerdict={{ Icon: CheckCircle2, tone: 'success' }}
          turnstileGate="failed"
          scanResult={{
            kind: 'ticket',
            outcome: 'checked_in',
            canCheckIn: true,
            status: 'usada',
            row: { status: 'usada', name: 'Juana Pérez', document: '30111222' },
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('alert').textContent).toMatch(/el molinete no respondió/i)
    expect(screen.queryByRole('button', { name: /registrar ingreso/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /reenviar pulso/i }))
    expect(onRetryTurnstile).toHaveBeenCalledOnce()
    expect(onScanCheckIn).not.toHaveBeenCalled()
  })
})
