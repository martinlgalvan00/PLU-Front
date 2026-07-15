import { ApiError } from '../lib/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const PHOTO_BUCKET = 'athlete-photos'
const MAX_PHOTO_BYTES = 3 * 1024 * 1024
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
    return { error: 'La imagen supera el límite de 3 MB.' }
  }
  return { ok: true }
}

function buildPhotoStoragePath(athleteId, fileName) {
  const safeName = sanitizeFileName(fileName)
  return `${athleteId}/${Date.now()}-${safeName}`
}

export async function uploadAthletePhoto(athleteId, file) {
  const validation = validateAthletePhotoFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new ApiError(
      'Supabase no está configurado. No se puede subir la foto en este entorno.',
      { status: 503 },
    )
  }

  const storagePath = buildPhotoStoragePath(athleteId, file.name)
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir la foto.', { status: 400 })
  }

  return { storagePath }
}

/** URL pública del bucket (bucket public=true, no necesita firma). */
export function getAthletePhotoPublicUrl(photoPath) {
  if (!photoPath || !isSupabaseConfigured || !supabase) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photoPath).data.publicUrl
}

export { PHOTO_BUCKET }
