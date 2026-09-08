import { HttpError } from '../../lib/errors.js'
import { athleteProfileFromRow, isProfileComplete } from '../../../shared/athleteProfile.js'
import {
  PROFILE_NOTICE_BULK_MAX,
  PROFILE_NOTICE_KIND,
  PROFILE_NOTICE_MESSAGE_MAX,
} from '../../../shared/profileNotice.js'

export { PROFILE_NOTICE_BULK_MAX, PROFILE_NOTICE_KIND, PROFILE_NOTICE_MESSAGE_MAX }

export function normalizeProfileNoticeMessage(message) {
  const trimmed = String(message ?? '').trim()
  if (!trimmed) return null
  if (trimmed.length > PROFILE_NOTICE_MESSAGE_MAX) {
    throw new HttpError(400, `La nota no puede superar ${PROFILE_NOTICE_MESSAGE_MAX} caracteres.`)
  }
  return trimmed
}

export async function sendProfileNotice({ repository, athleteId, message, createdBy }) {
  const row = await repository.findProfileCompleteness(athleteId)
  if (!row) throw new HttpError(404, 'No se encontró el atleta.')
  const status = isProfileComplete(athleteProfileFromRow(row))
  if (status.complete) {
    throw new HttpError(409, 'El perfil ya está completo.', { code: 'PROFILE_COMPLETE' })
  }
  const notice = await repository.upsertProfileNotice({
    athleteId,
    missingFields: status.missing,
    message: normalizeProfileNoticeMessage(message),
    createdBy,
  })
  return { notice, missing: status.missing }
}

export async function sendProfileNoticesBulk({ repository, athleteIds, message, createdBy }) {
  const unique = [...new Set(athleteIds)]
  if (unique.length > PROFILE_NOTICE_BULK_MAX) {
    throw new HttpError(400, `Podés avisar hasta ${PROFILE_NOTICE_BULK_MAX} atletas por vez.`)
  }
  const note = normalizeProfileNoticeMessage(message)
  const rows = await repository.findProfileCompletenessMany(unique)
  const byId = new Map((rows ?? []).map((row) => [row.id, row]))
  const sent = []
  const skipped = []
  const failed = []

  for (const athleteId of unique) {
    const row = byId.get(athleteId)
    if (!row) {
      failed.push({ athleteId, reason: 'not_found' })
      continue
    }
    const status = isProfileComplete(athleteProfileFromRow(row))
    if (status.complete) {
      skipped.push({ athleteId, reason: 'complete' })
      continue
    }
    try {
      const notice = await repository.upsertProfileNotice({
        athleteId,
        missingFields: status.missing,
        message: note,
        createdBy,
      })
      sent.push({ athleteId, notice })
    } catch (error) {
      failed.push({ athleteId, reason: error?.message || 'error' })
    }
  }

  return { sent, skipped, failed }
}

export async function resolveProfileNoticesIfComplete({ repository, athlete }) {
  const status = isProfileComplete(athlete)
  if (!status.complete) return { resolved: false, status }
  await repository.resolveOpenProfileNotices(athlete.id)
  return { resolved: true, status }
}
