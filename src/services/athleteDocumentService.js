import { ApiError, apiGet, apiPost } from '../lib/api.js'
import { compressAthleteDocumentFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'
import {
  ATHLETE_DOCUMENT_BUCKET,
  ATHLETE_DOCUMENT_MIME_TYPES,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES,
} from '../lib/athleteDocuments.js'

const ALLOWED_MIME_TYPES = new Set(ATHLETE_DOCUMENT_MIME_TYPES)

const EXTENSION_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

function sanitizeFileName(name) {
  return String(name ?? 'documento')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

/**
 * Algunos teléfonos entregan la foto con `type` vacío. El nombre alcanza
 * para saber si es JPG, PNG, WEBP o PDF. HEIC sigue afuera.
 */
export function athleteDocumentContentType(file) {
  const type = String(file?.type ?? '').toLowerCase()
  if (ALLOWED_MIME_TYPES.has(type)) return type
  const extension = String(file?.name ?? '')
    .split('.')
    .pop()
    ?.toLowerCase()
  return EXTENSION_CONTENT_TYPES[extension] ?? ''
}

function fileWithContentType(file, contentType) {
  if (!contentType || file.type === contentType) return file
  return new File([file], file.name || 'documento', {
    type: contentType,
    lastModified: file.lastModified,
  })
}

export function validateAthleteDocumentFile(file) {
  if (!file) return { error: 'Seleccioná un archivo.' }
  const fileName = String(file.name ?? '')
  const looksHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.hei[cf]$/i.test(fileName)
  if (looksHeic) {
    return { error: 'Mandalo en JPG o sacá una captura. El iPhone HEIC no entra.' }
  }
  const contentType = athleteDocumentContentType(file)
  if (!contentType) {
    return { error: 'Formato no admitido. Usá JPG, PNG, WEBP o PDF.' }
  }
  if (contentType === 'application/pdf' && file.size > ATHLETE_DOCUMENT_PDF_MAX_BYTES) {
    return { error: ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE }
  }
  if (file.size > ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES) {
    return { error: 'El archivo supera el límite de 400 KB.' }
  }
  return { ok: true, contentType }
}

export async function uploadAthleteDocument(kind, file) {
  const validation = validateAthleteDocumentFile(file)
  if (validation.error) {
    throw new ApiError(validation.error, { status: 400 })
  }
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir el documento.', {
      status: 503,
    })
  }

  const prepared = await compressAthleteDocumentFile(
    fileWithContentType(file, validation.contentType),
  )
  if (prepared.size > ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES) {
    throw new ApiError('El archivo sigue pesando demasiado después de comprimirlo.', { status: 400 })
  }

  const supabase = await getSupabaseClient()
  const upload = await apiPost('/api/athletes/me/documents/upload-url', {
    kind,
    fileName: sanitizeFileName(prepared.name),
    contentType: prepared.type,
    size: prepared.size,
  })
  if (!upload?.path || !upload?.token) {
    throw new ApiError('No se pudo preparar la carga del documento.', { status: 502 })
  }

  const { error: uploadError } = await supabase.storage
    .from(ATHLETE_DOCUMENT_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    throw new ApiError(uploadError.message ?? 'No se pudo subir el documento.', { status: 400 })
  }

  const { document } = await apiPost('/api/athletes/me/documents', {
    kind,
    storagePath: upload.path,
    contentType: prepared.type,
    sizeBytes: prepared.size,
    originalName: sanitizeFileName(file.name),
  })

  return { document, storagePath: upload.path }
}

function withDocumentVersion(path, version) {
  const stamp = String(version ?? '').trim()
  if (!stamp) return path
  return `${path}?v=${encodeURIComponent(stamp)}`
}

export function athleteDocumentUrl(kind, version = null) {
  return withDocumentVersion(`/api/athletes/me/documents/${encodeURIComponent(kind)}`, version)
}

export function adminAthleteDocumentUrl(athleteId, kind, version = null) {
  return withDocumentVersion(
    `/api/athletes/admin/${encodeURIComponent(athleteId)}/documents/${encodeURIComponent(kind)}`,
    version,
  )
}

export async function listAthleteDocuments() {
  return apiGet('/api/athletes/me/documents')
}
