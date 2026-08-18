import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago'
import { HttpError } from '../../lib/errors.js'

export function verifyMercadoPagoWebhook({
  xSignature,
  xRequestId,
  dataId,
  secret,
  toleranceSeconds = 300,
}) {
  if (!secret?.trim()) {
    throw new HttpError(503, 'Falta MERCADO_PAGO_WEBHOOK_SECRET.')
  }
  if (!dataId) {
    throw new HttpError(400, 'Webhook sin data.id.')
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId: String(dataId).toLowerCase(),
      secret,
      toleranceSeconds,
    })
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      throw new HttpError(401, 'Firma de webhook invalida.')
    }
    throw error
  }
}
