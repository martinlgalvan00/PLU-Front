/**
 * cookieConsentStorage.js — PLU ARG
 *
 * Lectura y escritura crudas de la decisión de cookies. Sin dependencias:
 * `analyticsService` importa este módulo para decidir si puede medir, así que
 * nada de este archivo puede depender de él (evita el ciclo).
 *
 * Solo hay dos categorías reales en el sitio:
 * - `necessary`: sesión httpOnly del staff y del atleta. No se apagan.
 * - `analytics`: el tracker de uso. Opt-in explícito.
 *
 * Sin decisión guardada no hay consentimiento: se trata como "analítica
 * denegada" hasta que la persona elija. El banner es el único lugar que
 * escribe la decisión.
 */

const CONSENT_KEY = 'plu-cookie-consent-v1'

export function readStoredConsent() {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.analytics !== 'boolean') return null
    return { necessary: true, analytics: parsed.analytics }
  } catch {
    // Sin localStorage (modo privado estricto) no hay decisión persistible:
    // cada sesión arranca sin consentimiento y el banner vuelve a ofrecerse.
    return null
  }
}

export function writeStoredConsent({ analytics }) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ analytics: Boolean(analytics) }))
  } catch {
    // La preferencia no persiste, pero la sesión actual queda respetada por
    // el estado en memoria del banner.
  }
}
