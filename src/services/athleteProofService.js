import { ApiError, apiPost } from '../lib/api.js'
import { compressPaymentProofFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * athleteProofService.js — PLU ARG
 *
 * Comprobante de transferencia de una orden de afiliación o inscripción.
 * Las imágenes se comprimen antes de subir (mismo espíritu que el retrato)
 * para no inflar Storage ni el egress al abrir la bandeja de Finanzas.
 */

const PROOF_BUCKET = 'athlete-payment-proofs'
const MAX_PROOF_BYTES = 2 * 1024 * 1024
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
    return { error: 'El archivo supera el límite de 2 MB.' }
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

  const prepared = await compressPaymentProofFile(file)
  const supabase = await getSupabaseClient()
  const upload = await apiPost(`/api/athletes/me/payment-orders/${orderId}/proof-upload`, {
    fileName: sanitizeFileName(prepared.name),
    contentType: prepared.type,
    size: prepared.size,
  })
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir el comprobante.', { status: 400 })
  }

  return { storagePath: upload.path }
}

export { PROOF_BUCKET }
