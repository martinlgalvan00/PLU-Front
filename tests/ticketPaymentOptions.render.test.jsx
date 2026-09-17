import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { TicketPaymentOptions } from '../src/components/ui/TicketPurchaseSection.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'

const PRICE_LABELS = {
  mercado_pago: { priceLabel: '$ 17.000' },
  transferencia: { priceLabel: '$ 16.000', savingsLabel: 'Ahorrás $ 1.000' },
}

function Chooser(props) {
  const { t } = useI18n()
  const [paymentMethod, setPaymentMethod] = useState('mercado_pago')

  return (
    <>
      <TicketPaymentOptions
        cashEnabled={false}
        manualEnabled
        mercadoPagoEnabled
        onChange={setPaymentMethod}
        paymentMethod={paymentMethod}
        priceLabels={PRICE_LABELS}
        t={t}
        wiseEnabled={false}
        {...props}
      />
      <output data-testid="value">{paymentMethod}</output>
    </>
  )
}

function renderChooser(props = {}) {
  return render(
    <I18nProvider>
      <Chooser {...props} />
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('TicketPaymentOptions', () => {
  it('conserva el contrato de radios que usan los e2e', () => {
    renderChooser()

    const mercadoPago = screen.getByRole('radio', { name: /Mercado Pago/ })
    expect(mercadoPago.getAttribute('name')).toBe('ticket-payment')
    expect(mercadoPago.getAttribute('value')).toBe('mercado_pago')
    expect(mercadoPago.checked).toBe(true)
  })

  it('en Mercado Pago dice que el QR abre la puerta', () => {
    renderChooser()

    expect(screen.getByText('Tu QR abre la puerta al confirmarse')).toBeTruthy()
    expect(screen.queryByText('QR al aprobarse, no al pagar')).toBeNull()
  })

  it('Wise cerrado sigue anunciado y no se puede elegir', () => {
    renderChooser()

    const wise = screen.getByRole('radio', { name: /Wise/ })
    expect(wise.disabled).toBe(true)
    expect(wise.getAttribute('value')).toBe('wise_transfer')
    expect(screen.getByText('Próximamente')).toBeTruthy()
  })

  it('transferencia promete el QR al aprobarse, no al pagar', () => {
    renderChooser()

    fireEvent.click(screen.getByRole('radio', { name: /Transferencia bancaria/ }))

    expect(screen.getByTestId('value').textContent).toBe('transferencia')
    expect(screen.getByText('QR al aprobarse, no al pagar')).toBeTruthy()
    expect(screen.queryByText('Tu QR abre la puerta al confirmarse')).toBeNull()
  })

  it('el ahorro viaja con el precio, no como reclamo aparte', () => {
    renderChooser()

    const transferencia = screen.getByRole('radio', { name: /Transferencia bancaria/ })
    const amounts = transferencia.closest('label').querySelector('.ticket-purchase__payment-amounts')
    expect(amounts.textContent).toContain('$ 16.000')
    expect(amounts.textContent).toContain('Ahorrás $ 1.000')
    expect(amounts.textContent).not.toContain('pagando así')
  })
})
