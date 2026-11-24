import { ApiError, apiGet, apiPost } from '../lib/api.js'
import { compressAthleteDocumentFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'
import {
  ATHLETE_DOCUMENT_BUCKET,
  ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE,
  ATHLETE_DOCUMENT_INTAKE_MAX_BYTES,
  ATHLETE_DOCUMENT_INTAKE_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_UNREADABLE_MESSAGE,
  ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES,
} from '../lib/athleteDocuments.js'

const STORED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const EXTENSION_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

const INPUT_CONTENT_TYPES = new Set(Object.values(EXTENSION_CONTENT_TYPES))

const ALIASED_CONTENT_TYPES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-ms-bmp': 'image/bmp',
  'image/x-bmp': 'image/bmp',
}

export const ATHLETE_DOCUMENT_FILE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/heic',
  'image/heif',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.heic',
  '.heif',
  'application/pdf',
  '.pdf',
].join(',')

function sanitizeFileName(name) {
  return String(name ?? 'documento')
    .trim()
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120)
}

/**
 * Algunos teléfonos entregan la foto con `type` vacío. El nombre alcanza
 * para saber si es JPG, PNG, WEBP, GIF, BMP, AVIF, HEIC o PDF.
 * HEIC se acepta acá y se convierte al comprimir, si el navegador puede abrirlo.
 */
export function athleteDocumentContentType(file) {
  const type = String(file?.type ?? '').toLowerCase()
  if (ALIASED_CONTENT_TYPES[type]) return ALIASED_CONTENT_TYPES[type]
  if (INPUT_CONTENT_TYPES.has(type)) return type
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
  const contentType = athleteDocumentContentType(file)
  if (!contentType) {
    return { error: 'Formato no admitido. Usá JPG, PNG, WEBP o PDF.' }
  }
  if (contentType === 'application/pdf') {
    if (file.size > ATHLETE_DOCUMENT_PDF_MAX_BYTES) {
      return { error: ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE }
    }
    return { ok: true, contentType }
  }
  if (file.size > ATHLETE_DOCUMENT_INTAKE_MAX_BYTES) {
    return { error: ATHLETE_DOCUMENT_INTAKE_TOO_LARGE_MESSAGE }
  }
  return { ok: true, contentType }
}

export async function prepareAthleteDocumentFile(file) {
  const validation = validateAthleteDocumentFile(file)
  if (validation.error) return { error: validation.error }
  try {
    const prepared = await compressAthleteDocumentFile(
      fileWithContentType(file, validation.contentType),
    )
    if (!STORED_CONTENT_TYPES.has(prepared.type)) {
      return { error: ATHLETE_DOCUMENT_UNREADABLE_MESSAGE }
    }
    if (prepared.size > ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES) {
      return { error: ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE }
    }
    return { ok: true, file: prepared, contentType: prepared.type }
  } catch (error) {
    if (error?.code === 'DOCUMENT_HEIC_UNSUPPORTED') {
      return { error: ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE }
    }
    return {
      error: error?.message || ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
    }
  }
}

export async function uploadAthleteDocument(kind, file) {
  const preparation = await prepareAthleteDocumentFile(file)
  if (preparation.error) {
    throw new ApiError(preparation.error, { status: 400 })
  }
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir el documento.', {
      status: 503,
    })
  }

  const prepared = preparation.file

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
