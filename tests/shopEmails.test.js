import { describe, expect, it } from 'vitest'
import {
  findMissingParams,
  getEmailDefinition,
} from '../server/modules/notifications/emailCatalog.js'
import { hasHtmlFallback, renderEmail } from '../server/modules/notifications/emailTemplates.js'

const params = {
  name: 'Lucía',
  reference: 'TND-AB3K9Z',
  amount: 48000,
  items: '1 × Buzo Pitbull (M)',
  paymentMethod: 'Transferencia bancaria',
  instructions: 'Transferí $ 48.000 a alias plu.tienda y subí el comprobante.',
  orderUrl: 'https://powerliftingunited.ar/tienda?pedido=abc#t=tok',
  expiresAt: '2026-10-13T20:00:00.000Z',
}

describe('correos de la tienda', () => {
  it('están en el catálogo como críticos y sin baja posible (son del pedido, no promoción)', () => {
    for (const type of ['shop_order_received', 'shop_order_confirmed']) {
      expect(getEmailDefinition(type)).toMatchObject({
        entityType: 'shop_order',
        optOutAllowed: false,
        critical: true,
      })
      expect(hasHtmlFallback(type)).toBe(true)
      expect(findMissingParams(type, params)).toEqual([])
    }
  })

  it('"recibimos tu pedido" lleva referencia, detalle, instrucciones y el link al pedido', () => {
    const { htmlContent, subject } = renderEmail('shop_order_received', params)
    expect(subject).toBe('Recibimos tu pedido')
    expect(htmlContent).toContain('TND-AB3K9Z')
    expect(htmlContent).toContain('1 × Buzo Pitbull (M)')
    expect(htmlContent).toContain('plu.tienda')
    expect(htmlContent).toContain('Ver mi pedido')
  })

  it('"tu pedido está pago" confirma sin pedir nada y muestra la nota de entrega', () => {
    const { htmlContent } = renderEmail('shop_order_confirmed', {
      ...params,
      fulfillmentNote: 'Retiro en sede',
    })
    expect(htmlContent).toContain('acreditamos el pago')
    expect(htmlContent).toContain('Retiro en sede')
  })

  it('escapa el contenido que escribe el comprador o el staff', () => {
    const { htmlContent } = renderEmail('shop_order_received', {
      ...params,
      name: '<script>alert(1)</script>',
      items: '<img src=x onerror=alert(1)>',
      instructions: '<b>hola</b>',
    })
    expect(htmlContent).not.toContain('<script>alert(1)</script>')
    expect(htmlContent).not.toContain('<img src=x')
    expect(htmlContent).not.toContain('<b>hola</b>')
  })
})
