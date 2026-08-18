import { describe, expect, it } from 'vitest'
import {
  applyMercadoPagoSubmitLabel,
  readActivePaymentSelectorText,
  resolveMercadoPagoSubmitKey,
  syncMercadoPagoSubmitLabel,
} from '../src/lib/mercadoPagoBrickUi.js'

describe('copy del CTA del Payment Brick', () => {
  it('distingue cuenta MP, crédito MP y tarjetas', () => {
    expect(resolveMercadoPagoSubmitKey('Mercado Pago Tus medios de pago preferidos')).toBe(
      'payments.submitContinueMp',
    )
    expect(resolveMercadoPagoSubmitKey('Crédito de Mercado Pago')).toBe(
      'payments.submitPayMpCredit',
    )
    expect(resolveMercadoPagoSubmitKey('Tarjeta de crédito Cuotas disponibles')).toBe(
      'payments.submitPayCredit',
    )
    expect(resolveMercadoPagoSubmitKey('Tarjeta de débito')).toBe('payments.submitPayDebit')
    expect(resolveMercadoPagoSubmitKey('Rapipago')).toBe('payments.submitPayTicket')
    expect(resolveMercadoPagoSubmitKey('')).toBe('payments.submitPay')
  })

  it('lee el selector activo y actualiza el botón nativo sin desmontarlo', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <form data-testid="payment-form">
        <div class="mp-checkout-bricks__selector-a active-x">Mercado Pago Tus medios de pago preferidos</div>
        <div class="mp-checkout-bricks__selector-b">Tarjeta de crédito Cuotas disponibles</div>
        <button type="submit">Pagar</button>
      </form>
    `

    expect(readActivePaymentSelectorText(root)).toContain('Mercado Pago')
    syncMercadoPagoSubmitLabel(
      root,
      (key) =>
        ({
          'payments.submitContinueMp': 'Continuar en Mercado Pago',
          'payments.submitPayCredit': 'Pagar con tarjeta',
        })[key],
    )
    expect(root.querySelector('button[type="submit"]').textContent).toBe(
      'Continuar en Mercado Pago',
    )

    root.querySelector('.mp-checkout-bricks__selector-a').classList.remove('active-x')
    root.querySelector('.mp-checkout-bricks__selector-b').classList.add('active-x')
    syncMercadoPagoSubmitLabel(
      root,
      (key) =>
        ({
          'payments.submitContinueMp': 'Continuar en Mercado Pago',
          'payments.submitPayCredit': 'Pagar con tarjeta',
        })[key],
    )
    expect(root.querySelector('button[type="submit"]').textContent).toBe('Pagar con tarjeta')
    expect(applyMercadoPagoSubmitLabel(root, 'Pagar con tarjeta')).toBe(false)
  })
})
