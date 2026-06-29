import { env } from '../config/env.js'
import { apiPost } from '../lib/api.js'

export function isMercadoPagoConfigured() {
  return env.mercadoPago.configured
}

export function createPaymentReference(method) {
  if (method === 'mercado_pago') {
    return `MP-${Date.now()}`
  }
  return `MANUAL-${Date.now()}`
}

export function getPaymentStatusForMethod(method) {
  return method === 'mercado_pago' ? 'pendiente' : 'validacion_manual'
}

export async function createPreference({ paymentId, amount, concept, athleteId }) {
  const reference = createPaymentReference('mercado_pago')

  if (!env.mercadoPago.configured) {
    return { preferenceId: `local-${paymentId}`, initPoint: null, reference }
  }

  try {
    return await apiPost('/api/payments/preferences', {
      paymentId,
      amount,
      concept,
      athleteId,
      reference,
    })
  } catch {
    return {
      preferenceId: `local-${paymentId}`,
      initPoint: `${env.appUrl}/pagos/${paymentId}`,
      reference,
    }
  }
}

export async function validatePayment(reference) {
  if (!env.mercadoPago.configured) {
    return { status: 'aprobado', reference }
  }

  try {
    return await apiPost('/api/payments/validate', { reference })
  } catch {
    return { status: 'pendiente', reference }
  }
}
