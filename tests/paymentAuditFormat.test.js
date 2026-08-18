import { describe, expect, it } from 'vitest'
import { formatRejectionActor } from '../src/lib/paymentAudit.js'

const t = (key) => ({ 'admin.payments.rejectionActorProvider': 'Mercado Pago' })[key] ?? key

describe('formatRejectionActor', () => {
  it('traduce el rechazo del proveedor a su nombre de marca', () => {
    expect(formatRejectionActor('mercado_pago', t)).toBe('Mercado Pago')
  })

  it('muestra el email del operador, no el uuid crudo', () => {
    expect(
      formatRejectionActor('staff:0f1c2d3e-4f5a-6b7c-8d9e-0a1b2c3d4e5f:finanzas@pluarg.com.ar', t),
    ).toBe('finanzas@pluarg.com.ar')
  })

  it('devuelve un guión cuando la orden no tiene registro de quién rechazó', () => {
    expect(formatRejectionActor(null, t)).toBe('—')
    expect(formatRejectionActor('', t)).toBe('—')
  })

  it('defiende valores desconocidos mostrándolos tal cual', () => {
    expect(formatRejectionActor('cron:expiry', t)).toBe('cron:expiry')
  })

  it('funciona sin traductor (fallback propio)', () => {
    expect(formatRejectionActor('mercado_pago')).toBe('Mercado Pago')
  })
})
