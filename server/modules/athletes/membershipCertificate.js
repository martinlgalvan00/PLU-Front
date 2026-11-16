import { isMembershipCurrent } from '../../../src/services/membershipService.js'
import { buildCredentialScanUrl } from '../notifications/eventCredentialNotificationService.js'

export const MEMBERSHIP_CERTIFICATE_NOT_CURRENT = 'MEMBERSHIP_NOT_CURRENT'
export const MEMBERSHIP_CERTIFICATE_UNAVAILABLE = 'MEMBERSHIP_CERTIFICATE_UNAVAILABLE'

/**
 * Mediodía local del día calendario de Argentina. La vigencia compara fechas
 * `YYYY-MM-DD` contra la medianoche local del `now` que recibe. En el servidor
 * ese local es UTC: sin anclar el día, entre las 21:00 y las 00:00 ART ya es
 * el día siguiente y se rechaza una afiliación que la cuenta sigue mostrando
 * como vigente.
 */
export function membershipCertificateNow(calendarDate, fallback = new Date()) {
  const stamp = String(calendarDate ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return fallback
  const now = new Date(`${stamp}T12:00:00`)
  return Number.isNaN(now.getTime()) ? fallback : now
}

function expirationTime(value) {
  const stamp = String(value ?? '')
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(stamp) ? `${stamp}T00:00:00` : stamp)
  return Number.isFinite(time) ? time : 0
}

function normalizeMembership(row) {
  return {
    id: row?.id ?? null,
    status: row?.status,
    startDate: row?.startDate ?? row?.start_date ?? null,
    expirationDate: row?.expirationDate ?? row?.expiration_date ?? null,
    memberCode: row?.memberCode ?? row?.member_code ?? '',
  }
}

/**
 * Constancia de una afiliación que cubre hoy. Reusa el token de credencial
 * que el atleta ya tiene: no crea otro QR. El documento viaja en la respuesta
 * autenticada y no en la URL pública.
 */
export function buildMembershipCertificate({
  athlete,
  memberships,
  appUrl,
  now = new Date(),
  issuedAt = now,
}) {
  const current = (memberships ?? [])
    .map(normalizeMembership)
    .filter((row) => row.id && isMembershipCurrent(row, now))
    .sort((a, b) => expirationTime(b.expirationDate) - expirationTime(a.expirationDate))[0]

  if (!current) return { ok: false, code: MEMBERSHIP_CERTIFICATE_NOT_CURRENT }

  const token = String(athlete?.credential_token ?? athlete?.credentialToken ?? '').trim()
  const memberCode = String(current.memberCode ?? '').trim()
  const code = token || memberCode
  if (!code) return { ok: false, code: MEMBERSHIP_CERTIFICATE_UNAVAILABLE }

  const issued = issuedAt instanceof Date && !Number.isNaN(issuedAt.getTime()) ? issuedAt : now

  return {
    ok: true,
    membershipId: current.id,
    certificate: {
      fullName: String(athlete?.full_name ?? athlete?.fullName ?? '').trim(),
      documentId: String(athlete?.document_id ?? athlete?.documentId ?? '').trim(),
      memberCode,
      startDate: current.startDate,
      expirationDate: current.expirationDate,
      credentialUrl: buildCredentialScanUrl(appUrl, code),
      issuedAt: issued.toISOString(),
    },
  }
}
