import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const confirmAthleteManualPayment = vi.fn()

vi.mock('../src/services/athleteApi.js', () => ({ confirmAthleteManualPayment }))

const ManualPaymentConfirmation = (
  await import('../src/components/checkout/ManualPaymentConfirmation.jsx')
).default

describe('ManualPaymentConfirmation', () => {
  it('declara la transferencia y explica la habilitacion financiada sin llamarla pago', async () => {
    confirmAthleteManualPayment.mockResolvedValue({
      order: {
        id: 'order-1',
        status: 'validacion_manual',
        financingAllowed: true,
        manualPaymentDeclaredAt: '2026-08-20T12:00:00.000Z',
        financedEntitlementsAt: '2026-08-20T12:00:00.000Z',
      },
      financed: true,
      entitlementsGranted: true,
    })
    const updated = vi.fn()
    window.addEventListener('plu:payment-updated', updated)

    render(
      <I18nProvider>
        <ManualPaymentConfirmation orderId="order-1" financingAllowed />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ya transferí' }))

    await waitFor(() => expect(confirmAthleteManualPayment).toHaveBeenCalledWith('order-1'))
    expect(await screen.findByText('Aviso recibido')).toBeTruthy()
    expect(screen.getByText(/saldo sigue pendiente de validación/i)).toBeTruthy()
    expect(screen.queryByText(/pago aprobado/i)).toBeNull()
    expect(updated).toHaveBeenCalledTimes(1)
    window.removeEventListener('plu:payment-updated', updated)
  })

  it('usa la accion especifica para efectivo', () => {
    render(
      <I18nProvider>
        <ManualPaymentConfirmation channel="cash_pitbull" orderId="order-2" />
      </I18nProvider>,
    )
    expect(screen.getByRole('button', { name: 'Ya entregué el efectivo' })).toBeTruthy()
  })
})
