import { ApiError, apiPost } from '../lib/api.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * athleteProofService.js — PLU ARG
 *
 * Comprobante de transferencia de una orden de afiliación o inscripción.
 * Mismo flujo que `ticketProofService.js` (el backend firma la subida, el
 * browser sube al bucket privado y después registra la ruta): las órdenes de
 * atleta tenían las columnas en la tabla desde la fase 2 pero ninguna vía para
 * escribirlas, así que Finanzas aprobaba transferencias sin evidencia adjunta.
 */

const PROOF_BUCKET = 'athlete-payment-proofs'
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function sanitizeFileName(name) {
  return String(name ?? 'comprobante')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

export function validateAthletePaymentProofFile(file) {
  if (!file) return { error: 'Seleccioná un archivo.' }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Formato no admitido. Usá JPG, PNG, WEBP o PDF.' }
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { error: 'El archivo supera el límite de 5 MB.' }
  }
  return { ok: true }
}

export async function uploadAthletePaymentProof(orderId, file) {
  const validation = validateAthletePaymentProofFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }

  if (!isSupabaseConfigured) {
    throw new ApiError(
      'Supabase no está configurado. No se puede subir el comprobante en este entorno.',
      { status: 503 },
    )
  }

  const supabase = await getSupabaseClient()
  const upload = await apiPost(`/api/athletes/me/payment-orders/${orderId}/proof-upload`, {
    fileName: sanitizeFileName(file.name),
    contentType: file.type,
    size: file.size,
  })
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir el comprobante.', { status: 400 })
  }

  return { storagePath: upload.path }
}

export { PROOF_BUCKET }
