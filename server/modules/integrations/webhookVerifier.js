import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago'
import { HttpError } from '../../lib/errors.js'

/**
 * Corrimiento del reloj contra el `ts` del header `x-signature`, en segundos y
 * sin asumir la unidad del timestamp.
 *
 * Mercado Pago documenta `ts` en SEGUNDOS (`ts=1704908010`, 10 dígitos), pero
 * el validador del SDK 3.2.0 lo compara asumiendo MILISEGUNDOS
 * (`Math.abs(Date.now() - ts) / 1000`): con el `ts` real de producción la
 * cuenta da ~1.700 millones de segundos de "atraso" y TODA firma auténtica
 * moría en `TimestampOutOfTolerance` — el 401 `signature_rejected` que llenaba
 * la bitácora aunque el secreto fuera el correcto. Los tests del repo no lo
 * veían porque firmaban con `Date.now()` (milisegundos), consistentes con el
 * mismo supuesto equivocado.
 *
 * La unidad se decide por la cantidad de dígitos: un unix-epoch en segundos
 * tiene 10 dígitos hasta el año 2286; en milisegundos ya va por 13. El corte en
 * 12 deja lugar de sobra para los dos formatos sin ambigüedad real.
 */
export function webhookTimestampSkewSeconds(ts, now = Date.now()) {
  const raw = String(ts ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  const tsMs = raw.length >= 12 ? value : value * 1000
  return Math.round((now - tsMs) / 1000)
}

function parseSignatureTs(xSignature) {
  for (const part of String(xSignature ?? '').split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim().toLowerCase() === 'ts') return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * Verifica el HMAC del webhook de Mercado Pago.
 *
 * `secret` admite varios valores separados por coma: es lo que permite rotar
 * el secreto sin ventana de rechazo (viejo y nuevo conviven mientras MP
 * termina de enviar con el anterior) y convivir con más de una aplicación de
 * MP apuntando a la misma URL. La firma vale si CUALQUIERA de los secretos la
 * produce.
 *
 * La antigüedad del `ts` se valida acá y no en el SDK, por el bug de unidades
 * de arriba: el SDK sólo comprueba el HMAC (que sí calcula bien, con el `ts`
 * textual del header dentro del manifiesto `id:…;request-id:…;ts:…;`).
 */
export function verifyMercadoPagoWebhook({
  xSignature,
  xRequestId,
  dataId,
  secret,
  toleranceSeconds = 300,
}) {
  const secrets = String(secret ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!secrets.length) {
    throw new HttpError(503, 'Falta MERCADO_PAGO_WEBHOOK_SECRET.')
  }
  if (!dataId) {
    throw new HttpError(400, 'Webhook sin data.id.')
  }

  const authentic = secrets.some((candidate) => {
    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        // MP arma el manifiesto con el data.id alfanumérico en minúsculas.
        dataId: String(dataId).toLowerCase(),
        secret: candidate,
        // Sin `toleranceSeconds` a propósito: la antigüedad se chequea abajo,
        // con la unidad del `ts` detectada en vez de asumida.
      })
      return true
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) return false
      throw error
    }
  })
  if (!authentic) {
    throw new HttpError(401, 'Firma de webhook invalida.')
  }

  const skewSeconds = webhookTimestampSkewSeconds(parseSignatureTs(xSignature))
  if (skewSeconds === null || Math.abs(skewSeconds) > toleranceSeconds) {
    throw new HttpError(401, 'Firma de webhook invalida.')
  }
}
