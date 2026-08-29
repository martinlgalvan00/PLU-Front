import { ApiError, apiPost } from '../lib/api.js'
import { compressImageFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

const PHOTO_BUCKET = 'athlete-photos'
const MAX_PHOTO_BYTES = 1 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function sanitizeFileName(name) {
  return String(name ?? 'foto')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

export function validateAthletePhotoFile(file) {
  if (!file) return { error: 'Seleccioná una imagen.' }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Formato no admitido. Usá JPG, PNG o WEBP.' }
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: 'La imagen supera el límite de 1 MB.' }
  }
  return { ok: true }
}

export async function uploadAthletePhoto(_athleteId, file) {
  const validation = validateAthletePhotoFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }

  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir la foto en este entorno.', {
      status: 503,
    })
  }

  const prepared = await compressImageFile(file)
  const supabase = await getSupabaseClient()
  const upload = await apiPost('/api/athletes/me/photo-upload', {
    fileName: sanitizeFileName(prepared.name),
    contentType: prepared.type,
    size: prepared.size,
  })
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: upload.cacheControl || '31536000',
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir la foto.', { status: 400 })
  }

  return { storagePath: upload.path }
}

/** URL pública del bucket (bucket public=true, no necesita firma). */
export { PHOTO_BUCKET }
