import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyMercadoPagoWebhook } from '../server/modules/integrations/webhookVerifier.js'

function signature({ dataId, requestId, secret, ts = Date.now() }) {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`
  const hash = createHmac('sha256', secret).update(manifest).digest('hex')
  return { xSignature: `ts=${ts},v1=${hash}`, ts }
}

describe('Mercado Pago webhook signature', () => {
  it('acepta una firma HMAC autentica', () => {
    const input = { dataId: 'ABC-123', requestId: 'request-1', secret: 'secret-for-tests' }
    const signed = signature(input)

    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: signed.xSignature,
        xRequestId: input.requestId,
        dataId: input.dataId,
        secret: input.secret,
        toleranceSeconds: 300,
      }),
    ).not.toThrow()
  })

  it('rechaza firmas falsas y timestamps vencidos', () => {
    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: `ts=${Date.now()},v1=${'0'.repeat(64)}`,
        xRequestId: 'request-1',
        dataId: 'payment-1',
        secret: 'secret-for-tests',
      }),
    ).toThrow('Firma de webhook invalida.')

    const old = signature({
      dataId: 'payment-1',
      requestId: 'request-1',
      secret: 'secret-for-tests',
      ts: Date.now() - 600_000,
    })
    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: old.xSignature,
        xRequestId: 'request-1',
        dataId: 'payment-1',
        secret: 'secret-for-tests',
        toleranceSeconds: 300,
      }),
    ).toThrow('Firma de webhook invalida.')
  })
})
