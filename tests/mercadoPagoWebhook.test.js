import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  verifyMercadoPagoWebhook,
  webhookTimestampSkewSeconds,
} from '../server/modules/integrations/webhookVerifier.js'

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

  it('acepta el ts en SEGUNDOS, que es como lo documenta Mercado Pago', () => {
    // El bug de producción: MP manda `ts=1704908010` (segundos, 10 dígitos) y
    // el SDK 3.2.0 lo compara asumiendo milisegundos — toda firma auténtica
    // moría en TimestampOutOfTolerance. Este caso es el que faltaba: firmado
    // igual que el header real, fresco, tiene que pasar.
    const input = { dataId: '175951629312', requestId: 'request-1', secret: 'secret-for-tests' }
    const signed = signature({ ...input, ts: Math.floor(Date.now() / 1000) })

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

  it('un ts en segundos vencido se rechaza igual que uno en milisegundos', () => {
    const stale = signature({
      dataId: 'payment-1',
      requestId: 'request-1',
      secret: 'secret-for-tests',
      ts: Math.floor(Date.now() / 1000) - 600,
    })
    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: stale.xSignature,
        xRequestId: 'request-1',
        dataId: 'payment-1',
        secret: 'secret-for-tests',
        toleranceSeconds: 300,
      }),
    ).toThrow('Firma de webhook invalida.')
  })

  it('admite varios secretos separados por coma, para rotar sin ventana de rechazo', () => {
    const signedWithOld = signature({
      dataId: 'payment-1',
      requestId: 'request-1',
      secret: 'secreto-viejo',
    })

    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: signedWithOld.xSignature,
        xRequestId: 'request-1',
        dataId: 'payment-1',
        secret: 'secreto-nuevo, secreto-viejo',
        toleranceSeconds: 300,
      }),
    ).not.toThrow()

    // Y un secreto ajeno a la lista sigue siendo un 401.
    expect(() =>
      verifyMercadoPagoWebhook({
        xSignature: signedWithOld.xSignature,
        xRequestId: 'request-1',
        dataId: 'payment-1',
        secret: 'secreto-nuevo, otro-mas',
        toleranceSeconds: 300,
      }),
    ).toThrow('Firma de webhook invalida.')
  })

  it('el corrimiento del reloj se mide con la unidad detectada', () => {
    const nowMs = 1_704_908_010_000
    // Segundos (10 dígitos): fresco.
    expect(webhookTimestampSkewSeconds('1704908010', nowMs)).toBe(0)
    // Milisegundos (13 dígitos): fresco.
    expect(webhookTimestampSkewSeconds(String(nowMs), nowMs)).toBe(0)
    // Segundos, 10 minutos viejo.
    expect(webhookTimestampSkewSeconds('1704907410', nowMs)).toBe(600)
    // Basura: no se inventa un corrimiento.
    expect(webhookTimestampSkewSeconds('abc', nowMs)).toBe(null)
  })
})
