import { ApiError, apiGet, apiPost } from '../lib/api.js'
import { compressPaymentProofFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * staffApplicationService.js — PLU ARG
 *
 * Postulación al Cuerpo de Staff: dos archivos (foto de perfil, certificado
 * de antecedentes) suben directo a Storage con una URL firmada que emite el
 * backend, mismo circuito que `athleteProofService.js`. La foto se comprime
 * client-side antes de subir; el certificado (a menudo un PDF) no.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function sanitizeFileName(name) {
  return String(name ?? 'archivo')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

export function validateStaffApplicationFile(file) {
  if (!file) return { error: 'Seleccioná un archivo.' }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Formato no admitido. Usá JPG, PNG, WEBP o PDF.' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'El archivo supera el límite de 5 MB.' }
  }
  return { ok: true }
}

export async function uploadStaffApplicationFile(purpose, file) {
  const validation = validateStaffApplicationFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir el archivo.', {
      status: 503,
    })
  }

  // `compressPaymentProofFile` solo comprime si es imagen; un certificado en
  // PDF pasa intacto, así que no hace falta ramificar por `purpose`.
  const prepared = await compressPaymentProofFile(file)
  const supabase = await getSupabaseClient()
  const upload = await apiPost('/api/athletes/me/staff-applications/upload-url', {
    purpose,
    fileName: sanitizeFileName(prepared.name),
    contentType: prepared.type,
    size: prepared.size,
  })
  const { error: uploadError } = await supabase.storage
    .from('staff-application-documents')
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir el archivo.', { status: 400 })
  }

  return { storagePath: upload.path }
}

export async function submitStaffApplication(payload) {
  return apiPost('/api/athletes/me/staff-applications', payload)
}

export async function listStaffApplications({ status = null, limit = 50 } = {}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  const result = await apiGet(`/api/athletes/admin/staff-applications${query ? `?${query}` : ''}`)
  return result?.applications ?? []
}

export async function reviewStaffApplication(applicationId, { status, notes }) {
  return apiPost(`/api/athletes/admin/staff-applications/${applicationId}/review`, {
    status,
    notes,
  })
}
