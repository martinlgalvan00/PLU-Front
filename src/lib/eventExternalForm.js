/**
 * Formulario externo de un evento (Google Forms) — PLU ARG
 *
 * El staff pega el link de un Google Form y el sitio ofrece el botón y un QR
 * para responderlo. Solo se aceptan los dominios de Google Forms y siempre por
 * https: la URL termina en un `href` público y en un QR que se imprime, así que
 * no puede ser `javascript:`, `data:` ni un sitio cualquiera.
 *
 * Mismas reglas en la API y en la RPC (`staff_merge_event_external_form`).
 */

export const EXTERNAL_FORM_URL_MAX = 500
export const EXTERNAL_FORM_LABEL_MAX = 60

const EMPTY_FORM = Object.freeze({ url: '', label: '' })

/** ¿El host y el camino son de Google Forms? */
function isGoogleFormsLocation(url) {
  const host = url.hostname.toLowerCase()
  if (host === 'forms.gle') return url.pathname.length > 1
  if (host === 'docs.google.com' || host === 'forms.google.com') {
    return /^\/(?:[a-z]\/[^/]+\/)?forms\/.+/i.test(url.pathname)
  }
  return false
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, url: string } | { ok: false, reason: 'invalid'|'insecure'|'host'|'too_long' }}
 */
export function normalizeExternalFormUrl(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: true, url: '' }
  if (raw.length > EXTERNAL_FORM_URL_MAX) return { ok: false, reason: 'too_long' }

  let url
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (url.protocol === 'http:') return { ok: false, reason: 'insecure' }
  if (url.protocol !== 'https:') return { ok: false, reason: 'invalid' }
  if (url.username || url.password) return { ok: false, reason: 'invalid' }
  if (url.hostname.toLowerCase() === 'forms.gle' && url.pathname.length <= 1) {
    return { ok: false, reason: 'invalid' }
  }
  if (!isGoogleFormsLocation(url)) return { ok: false, reason: 'host' }
  return { ok: true, url: raw }
}

/** Forma canónica `{ url, label }`; una URL inválida o vacía descarta también la etiqueta. */
export function normalizeExternalForm(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const checked = normalizeExternalFormUrl(source.url)
  if (!checked.ok || !checked.url) return { ...EMPTY_FORM }
  return {
    url: checked.url,
    label: String(source.label ?? '')
      .trim()
      .slice(0, EXTERNAL_FORM_LABEL_MAX),
  }
}

export function externalFormFromRules(rules) {
  return normalizeExternalForm(rules?.externalForm)
}

export function eventExternalForm(event) {
  return normalizeExternalForm(event?.externalForm)
}
