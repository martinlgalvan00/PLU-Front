import { unlockOfferCode } from './athleteApi.js'

export const SECRET_OFFER_REDIRECT_DELAY_MS = 700

export function normalizeRedemptionCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Canje transversal de una llave secreta. No recibe alcance de compra porque
 * la propia oferta define evento, combo y precio; por eso funciona igual desde
 * afiliacion, calendario, inscripcion o entradas.
 */
export async function redeemSecretOfferCode(value, { unlock = unlockOfferCode } = {}) {
  const code = normalizeRedemptionCode(value)
  if (!code) return { unlocked: false, reason: 'not_found', code }
  const result = await unlock({ code })
  return { ...result, code }
}

/**
 * Un preview rechazado por alcance no alcanza para decidir que el código es
 * inválido. Algunas versiones de la RPC no adjuntan `kind` en ese rechazo;
 * el endpoint de canje y el preview del combo son las fuentes autoritativas.
 */
export function shouldTrySecretOfferFallback(preview) {
  return preview?.valid === false && preview?.reason === 'not_applicable'
}

/** Deja que el estado de redireccion sea perceptible y anunciable. */
export function waitForSecretOfferRedirect(delay = SECRET_OFFER_REDIRECT_DELAY_MS) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay))
}
