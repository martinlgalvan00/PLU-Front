import { readStoredConsent, writeStoredConsent } from '../lib/cookieConsentStorage.js'
import { setOptedOut } from './analyticsService.js'

/**
 * cookieConsentService.js — PLU ARG
 *
 * Orquesta la decisión de cookies del visitante: la guarda, la sincroniza con
 * el opt-out de analítica y avisa a la interfaz. La UI (banner, footer) habla
 * con este servicio; el tracker consulta el storage directamente para no
 * generar ciclos de importación.
 *
 * Reglas:
 * - La categoría necesaria (sesión httpOnly) no se negocia: siempre activa.
 * - La analítica es opt-in explícito. Sin decisión guardada, denegada.
 * - Cambiar la decisión actualiza el opt-out del tracker en el mismo gesto,
 *   para que "apagar" y "encender" sean simétricos y reversibles.
 */

const CONSENT_EVENT = 'plu:cookie-consent'
const PREFERENCES_EVENT = 'plu:cookie-preferences'

export function getConsent() {
  return readStoredConsent()
}

export function hasDecided() {
  return readStoredConsent() !== null
}

export function analyticsAllowed() {
  return readStoredConsent()?.analytics === true
}

export function decideConsent({ analytics }) {
  writeStoredConsent({ analytics: Boolean(analytics) })
  // Simetría con el toggle del footer: aceptar analítica limpia el opt-out,
  // rechazarla lo prende. Quien canjea un código o paga no tiene que saber
  // que existen dos interruptores para la misma cosa.
  setOptedOut(!analytics)
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { analytics } }))
}

export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT))
}

export function onConsentChange(handler) {
  function listener(event) {
    handler(event.detail ?? {})
  }
  window.addEventListener(CONSENT_EVENT, listener)
  return () => window.removeEventListener(CONSENT_EVENT, listener)
}

export function onOpenPreferences(handler) {
  function listener() {
    handler()
  }
  window.addEventListener(PREFERENCES_EVENT, listener)
  return () => window.removeEventListener(PREFERENCES_EVENT, listener)
}
