/**
 * Completitud del legajo de documentos para afiliarse / inscribirse.
 * Vive en shared/ para que UI y API usen la misma regla.
 */

export const ATHLETE_DOCUMENT_KINDS = [
  'dni_front',
  'dni_back',
  'medical_certificate',
  'minor_authorization',
]

export const REQUIRED_ATHLETE_DOCUMENT_KINDS = ['dni_front', 'dni_back']

/** Se puede subir, pero no bloquea afiliación, combo ni inscripción. */
export const OPTIONAL_ATHLETE_DOCUMENT_KINDS = ['medical_certificate']

export const ATHLETE_DOCUMENT_KIND_LABELS = {
  dni_front: 'DNI frente',
  dni_back: 'DNI dorso',
  medical_certificate: 'certificado médico',
  minor_authorization: 'autorización del tutor',
}

export const ATHLETE_DOCUMENT_BUCKET = 'athlete-documents'
/** Tope del binario que se guarda. Storage y Postgres usan el mismo número. */
export const ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES = 400 * 1024
/** Un PDF no se puede achicar en el navegador: el corte es el mismo tope de Storage. */
export const ATHLETE_DOCUMENT_PDF_MAX_BYTES = ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES
/** Tope de la foto original, antes de comprimir, para no trabar el celular. */
export const ATHLETE_DOCUMENT_INTAKE_MAX_BYTES = 20 * 1024 * 1024
export const ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE =
  'El PDF es demasiado pesado. Sacá una foto del documento.'
export const ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE =
  'Mandalo en JPG o sacá una captura. El iPhone HEIC no entra.'
export const ATHLETE_DOCUMENT_INTAKE_TOO_LARGE_MESSAGE =
  'La foto pesa demasiado para procesarla. Elegí otra o sacala de nuevo.'
export const ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE =
  'El archivo sigue pesando demasiado después de comprimirlo.'
export const ATHLETE_DOCUMENT_UNREADABLE_MESSAGE =
  'No se pudo leer la foto. Mandala en JPG.'

export const ATHLETE_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

export function athleteAgeYears(birthDate, now = new Date()) {
  const stamp = String(birthDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return null
  const birth = new Date(`${stamp}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  const monthDelta = now.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

export function isAthleteMinor(birthDate, now = new Date()) {
  const age = athleteAgeYears(birthDate, now)
  return age != null && age < 18
}

export function requiredDocumentKinds(athlete, { now = new Date() } = {}) {
  const birthDate = athlete?.birthDate ?? athlete?.birth_date
  const kinds = [...REQUIRED_ATHLETE_DOCUMENT_KINDS]
  if (isAthleteMinor(birthDate, now)) kinds.push('minor_authorization')
  return kinds
}

export function documentKindOf(row) {
  return row?.kind ?? null
}

export function isDocumentPackComplete(athlete, documents = athlete?.documents, { now } = {}) {
  const required = requiredDocumentKinds(athlete, { now })
  // `undefined` = el payload todavía no trae el legajo (sesión vieja o fixture
  // de test). Un array vacío sí es "cargó y no hay nada".
  if (documents == null) {
    return {
      complete: true,
      missing: [],
      required,
      filled: 0,
      total: required.length,
      unavailable: true,
    }
  }
  const uploaded = new Set(
    documents.map((row) => documentKindOf(row)).filter((kind) => Boolean(kind)),
  )
  const missing = required.filter((kind) => !uploaded.has(kind))
  return {
    complete: missing.length === 0,
    missing,
    required,
    filled: required.length - missing.length,
    total: required.length,
  }
}

/**
 * Pagar afiliación o combo siempre exige DNI frente y dorso (y la
 * autorización del tutor si es menor). El certificado médico no entra.
 * Una cuenta anterior puede inscribirse a un torneo abierto sin el DNI.
 * Si el torneo exige afiliación, el DNI se pide igual.
 */
export function needsDocumentGateForRegistration(athlete, { requiresMembership = false } = {}) {
  if (!athlete) return true
  if (requiresMembership === true) return true
  return athlete.documentsGrandfathered !== true && athlete.documents_grandfathered !== true
}

export function needsDocumentGate({ athlete, purpose, requiresMembership = false }) {
  if (purpose === 'membership' || purpose === 'combo') return true
  if (purpose === 'registration') {
    return needsDocumentGateForRegistration(athlete, { requiresMembership })
  }
  return true
}

export function documentPackGate(
  athlete,
  documents = athlete?.documents,
  { purpose, now, requiresMembership = false } = {},
) {
  if (!needsDocumentGate({ athlete, purpose, requiresMembership })) {
    return { blocked: false, complete: true, missing: [], required: requiredDocumentKinds(athlete, { now }) }
  }
  const pack = isDocumentPackComplete(athlete, documents, { now })
  return {
    blocked: !pack.complete,
    complete: pack.complete,
    missing: pack.missing,
    required: pack.required,
    unavailable: pack.unavailable === true,
  }
}

/**
 * El botón de pagar sigue el legajo que la cuenta ya tiene. Un rechazo
 * `ATHLETE_DOCUMENTS_INCOMPLETE` solo mantiene el cargador mientras esa lista
 * todavía no llegó (`documents == null`). Si la lista está y está completa,
 * el rechazo anterior no deja el botón apagado.
 */
export function documentsBlockCheckout({ gate, documents, rejectionPending = false } = {}) {
  if (gate?.blocked) return true
  return rejectionPending === true && !Array.isArray(documents)
}

/**
 * Qué archivo obligatorio falta, para no decir "DNI" cuando el frente y el
 * dorso ya están y lo que traba es la autorización del tutor.
 * `dni` también cubre un faltante vacío o desconocido: es el caso general.
 */
export function documentPackFocus(missing = []) {
  const kinds = new Set(missing)
  const dni = kinds.has('dni_front') || kinds.has('dni_back')
  const guardian = kinds.has('minor_authorization')
  if (dni && guardian) return 'dni_and_guardian'
  if (guardian) return 'guardian'
  return 'dni'
}

export function isSafeAthleteDocumentPath(path, { athleteId = null, kind = null } = {}) {
  const value = String(path ?? '').trim()
  if (!value || value.length > 300) return false
  if (value.includes('..') || value.includes('\\') || value.startsWith('/')) return false
  const parts = value.split('/')
  if (parts.length !== 3) return false
  if (!parts[0] || !parts[1] || !parts[2]) return false
  if (!ATHLETE_DOCUMENT_KINDS.includes(parts[1])) return false
  if (athleteId && parts[0] !== String(athleteId)) return false
  if (kind && parts[1] !== kind) return false
  return true
}
