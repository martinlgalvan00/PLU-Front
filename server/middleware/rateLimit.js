import rateLimit from 'express-rate-limit'

/**
 * rateLimit.js — PLU ARG
 *
 * Presets compartidos, nombrados por nivel de riesgo (no uno por endpoint) --
 * antes cada route file definía su propio `rateLimit(...)` inline, con
 * configs inconsistentes (ej. `payments.js` usaba `standardHeaders: 'draft-8'`
 * mientras el resto usaba `true`) y varios endpoints públicos quedaban sin
 * ningún límite (el más grave: GET /api/tickets/verify/:qrToken, que permitía
 * enumerar QR tokens sin fricción).
 *
 * Nota: el store en memoria default de express-rate-limit no comparte estado
 * entre procesos -- si el deploy pasa a multi-instancia, migrar a un store
 * compartido (ej. Redis, vía `rate-limit-redis`).
 */

function buildLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  })
}

// Login y /oauth/session -- ventana larga, límite bajo, ya calibrado.
export const authLimiter = buildLimiter(
  15 * 60 * 1000,
  20,
  'Demasiados intentos. Proba de nuevo en unos minutos.',
)

// Escritura pública sin auth: registro de atleta, alta de orden de membresía.
export const publicWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  30,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
)

// Compra de tickets -- más alto que publicWriteLimiter a propósito: una
// compra cubre hasta 8 asistentes en un solo flujo.
export const ticketPublicWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  40,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
)

// Lecturas públicas sin auth (verificación de QR, estado de pago con
// polling durante checkout, catálogo de planes) -- ventana corta y volumen
// generoso, pensado para no frenar el polling legítimo del frontend.
export const publicReadLimiter = buildLimiter(
  60 * 1000,
  60,
  'Demasiadas solicitudes. Proba de nuevo en un momento.',
)

// Checkout: preferencias de pago, checkout embebido, suscripciones.
export const checkoutLimiter = buildLimiter(
  15 * 60 * 1000,
  30,
  'Demasiados intentos de checkout. Probá nuevamente en unos minutos.',
)

// Escrituras con cookie de atleta ya autenticada (editar perfil, foto) --
// más generoso que publicWriteLimiter porque ya pasó por requireAthleteSession.
export const athleteWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  60,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
)

// Todo lo staff-only: ya protegido por rol (requireRole), este límite es
// defensa en profundidad ante una cuenta comprometida o un script/bug de
// polling descontrolado en el panel admin, no control de abuso primario --
// de ahí el volumen alto. Calibrado con margen para escaneo de check-in en
// puerta: varios dispositivos detrás del mismo NAT de wifi del venue,
// escaneando a su cooldown máximo (~27/min c/u, ver SCAN_COOLDOWN_MS en
// AdminQrScanner.jsx), no deberían acercarse a este límite.
export const staffLimiter = buildLimiter(
  5 * 60 * 1000,
  900,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
)
