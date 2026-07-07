import { ApiError } from '../lib/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const PROOF_BUCKET = 'ticket-payment-proofs'
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function sanitizeFileName(name) {
  return String(name ?? 'comprobante')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

export function validateTicketPaymentProofFile(file) {
  if (!file) return { error: 'Seleccioná un archivo.' }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Formato no admitido. Usá JPG, PNG, WEBP o PDF.' }
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { error: 'El archivo supera el límite de 5 MB.' }
  }
  return { ok: true }
}

function buildProofStoragePath(orderId, fileName) {
  const safeName = sanitizeFileName(fileName)
  return `${orderId}/${Date.now()}-${safeName}`
}

export async function uploadTicketPaymentProof(orderId, file) {
  const validation = validateTicketPaymentProofFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new ApiError(
      'Supabase no está configurado. No se puede subir el comprobante en este entorno.',
      { status: 503 },
    )
  }

  const storagePath = buildProofStoragePath(orderId, file.name)
  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir el comprobante.', { status: 400 })
  }

  return { storagePath }
}

export { PROOF_BUCKET }
