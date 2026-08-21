import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PaymentsSection from '../src/pages/profile/PaymentsSection.jsx'
import { derivePaymentProgress } from '../src/lib/paymentProgress.js'

afterEach(cleanup)

function pago(order, attempts = [], extra = {}) {
  const { outcome, ...rest } = extra
  return {
    id: order.id ?? 'orden-1',
    concept: 'Afiliación PLU anual 2026',
    conceptType: 'membership',
    amount: 85000,
    reference: 'MORD-007fe4e3016a3dad',
    createdAt: '2026-08-20T14:23:21.048Z',
    ...rest,
    progress: derivePaymentProgress({ order, attempts, outcome }),
  }
}

function renderSection(payments, props = {}) {
  return render(
    <I18nProvider>
      <PaymentsSection payments={payments} {...props} />
    </I18nProvider>,
  )
}

describe('sección de pagos de la cuenta', () => {
  it('una afiliación acreditada tras un rechazo se muestra acreditada', () => {
    // El caso de producción: el rechazo posterior no puede ser el estado.
    renderSection([
      pago(
        { status: 'aprobado', method: 'mercado_pago' },
        [
          { external_payment_id: '173831512161', status: 'rechazado', status_detail: 'cc_rejected_high_risk', created_at: '2026-08-20T14:37:56.471Z' },
          { external_payment_id: '174765196850', status: 'aprobado', confirmed_at: '2026-08-20T21:27:38.064Z' },
        ],
      ),
    ])

    expect(screen.getByText('Acreditado')).toBeTruthy()
    expect(screen.queryByText('Rechazado')).toBeNull()
    // Y explica el aviso de rechazo que pudo haber recibido antes.
    expect(screen.getByText(/1 intento rechazado/i)).toBeTruthy()
  })

  it('declara qué se pagó, no solo "Pago PLU"', () => {
    renderSection([
      pago({ status: 'aprobado', method: 'mercado_pago' }, [], {
        concept: 'Afiliación PLU anual 2026 + Inscripción Pitbull Classic',
        conceptDetail: 'Open · Raw',
      }),
    ])

    expect(screen.getByText('Afiliación PLU anual 2026 + Inscripción Pitbull Classic')).toBeTruthy()
    expect(screen.getByText('Open · Raw')).toBeTruthy()
  })

  it('un rechazo real muestra el motivo en castellano y ofrece reintentar', () => {
    const onRetryPayment = vi.fn()
    renderSection(
      [
        pago({ status: 'rechazado', method: 'mercado_pago' }, [
          { external_payment_id: '1', status: 'rechazado', status_detail: 'cc_rejected_high_risk' },
        ]),
      ],
      { onRetryPayment },
    )

    expect(screen.getByText('Rechazado')).toBeTruthy()
    expect(screen.getByText(/Mercado Pago rechazó el pago por seguridad/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Generar un cobro nuevo/i }))
    expect(onRetryPayment).toHaveBeenCalledTimes(1)
  })

  it('una transferencia en revisión muestra el recorrido y en qué etapa está', () => {
    renderSection([
      pago({
        status: 'validacion_manual',
        method: 'manual_link',
        manualPaymentChannel: 'bank_transfer',
        paymentProofUploadedAt: '2026-08-20T15:00:00.000Z',
      }),
    ])

    expect(screen.getByText('En revisión')).toBeTruthy()
    expect(screen.getByText(/Transferencia bancaria/)).toBeTruthy()
    expect(screen.getByText('Comprobante')).toBeTruthy()
    // La etapa actual queda anunciada al lector de pantalla, no solo por color.
    const current = document.querySelector('[aria-current="step"]')
    expect(current?.textContent).toContain('Revisión')
  })

  it('una orden vencida dice cuándo venció y que no hubo intento de pago', () => {
    renderSection([
      pago({
        status: 'cancelado',
        method: 'mercado_pago',
        expiresAt: '2026-08-20T14:53:00.000Z',
        updatedAt: '2026-08-20T14:54:00.000Z',
      }),
    ])

    expect(screen.getByText(/sin que se registrara ningún intento de pago/i)).toBeTruthy()
    // Con fecha Y hora: una orden de Mercado Pago vive 30 minutos, así que sin
    // la hora "venció el 20 de ago" no ubica a nadie.
    expect(screen.getByText(/Venció el 20 ago, 11:53/i)).toBeTruthy()
  })

  it('un vencimiento con intentos fallidos suma por qué no entró ninguno', () => {
    renderSection([
      pago(
        {
          status: 'cancelado',
          method: 'mercado_pago',
          expiresAt: '2026-08-20T14:53:00.000Z',
          updatedAt: '2026-08-20T14:54:00.000Z',
        },
        [{ external_payment_id: '1', status: 'rechazado', status_detail: 'cc_rejected_insufficient_amount' }],
      ),
    ])

    expect(screen.getByText(/ningún intento de pago llegó a acreditarse/i)).toBeTruthy()
    expect(screen.getByText(/La tarjeta no tenía fondos suficientes/i)).toBeTruthy()
  })

  it('el caso Michelle: cobro cancelado con la afiliación activa no se contradice', () => {
    // Afiliación: activa (activada a mano). Pagos: cancelada por vencimiento.
    // La fila tiene que explicar las dos cosas juntas.
    const onRetryPayment = vi.fn()
    renderSection(
      [
        pago(
          {
            status: 'cancelado',
            method: 'mercado_pago',
            expiresAt: '2026-08-20T19:36:32.131Z',
            updatedAt: '2026-08-20T19:39:00.100Z',
          },
          [],
          { outcome: { kind: 'membership', status: 'activa' } },
        ),
      ],
      { onRetryPayment },
    )

    expect(screen.getByText(/Tu afiliación quedó activa igual/i)).toBeTruthy()
    expect(screen.getByText(/sin que se registrara ningún intento de pago/i)).toBeTruthy()
    // Y no se le ofrece pagar de nuevo algo que ya tiene.
    expect(screen.queryByRole('button', { name: /Generar un cobro nuevo/i })).toBeNull()
  })

  it('sin cobros invita a afiliarse en vez de mostrar una lista vacía', () => {
    const onNavigateSection = vi.fn()
    renderSection([], { onNavigateSection })

    expect(screen.getByText(/Todavía no generaste ningún cobro/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ir a Afiliación/i }))
    expect(onNavigateSection).toHaveBeenCalledWith('account-membership')
  })
})
