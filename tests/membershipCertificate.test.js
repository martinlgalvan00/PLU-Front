import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildMembershipCertificate,
  MEMBERSHIP_CERTIFICATE_NOT_CURRENT,
  MEMBERSHIP_CERTIFICATE_UNAVAILABLE,
  membershipCertificateNow,
} from '../server/modules/athletes/membershipCertificate.js'

const now = new Date('2026-11-16T15:00:00-03:00')
const appUrl = 'https://plu.test'

const athlete = {
  full_name: 'Ana Torres',
  document_id: '30111222',
  credential_token: 'a4f1c0de-0000-4000-8000-000000000001',
}

function membership(overrides = {}) {
  return {
    id: 'mem-1',
    status: 'activa',
    start_date: '2026-01-01',
    expiration_date: '2026-12-31',
    member_code: 'PLU-014',
    ...overrides,
  }
}

describe('constancia de afiliación', () => {
  it('la emite con la afiliación vigente y el QR que el atleta ya tiene', () => {
    const built = buildMembershipCertificate({
      athlete,
      memberships: [membership()],
      appUrl,
      now,
    })

    expect(built.ok).toBe(true)
    expect(built.membershipId).toBe('mem-1')
    expect(built.certificate.fullName).toBe('Ana Torres')
    expect(built.certificate.documentId).toBe('30111222')
    expect(built.certificate.memberCode).toBe('PLU-014')
    const url = new URL(built.certificate.credentialUrl)
    expect(url.origin).toBe('https://plu.test')
    expect(url.searchParams.get('credencial')).toBe(athlete.credential_token)
    expect(url.search).not.toContain('30111222')
    expect(built.certificate.credentialUrl).not.toContain(built.certificate.documentId)
  })

  it('no la emite si está vencida, cancelada, reembolsada o programada', () => {
    const cases = [
      membership({ expiration_date: '2020-12-31' }),
      membership({ status: 'vencida' }),
      membership({ status: 'cancelada' }),
      membership({ status: 'reembolsada' }),
      membership({ start_date: '2027-01-01', expiration_date: '2027-12-31' }),
    ]
    for (const row of cases) {
      const built = buildMembershipCertificate({
        athlete,
        memberships: [row],
        appUrl,
        now,
      })
      expect(built.ok).toBe(false)
      expect(built.code).toBe(MEMBERSHIP_CERTIFICATE_NOT_CURRENT)
    }
  })

  it('si no hay token, el QR usa el número de socio que ya existe', () => {
    const built = buildMembershipCertificate({
      athlete: { ...athlete, credential_token: '' },
      memberships: [membership()],
      appUrl,
      now,
    })
    expect(built.ok).toBe(true)
    expect(new URL(built.certificate.credentialUrl).searchParams.get('credencial')).toBe('PLU-014')
  })

  it('no inventa un código si no hay token ni número de socio', () => {
    const built = buildMembershipCertificate({
      athlete: { full_name: 'Ana Torres', document_id: '30111222' },
      memberships: [membership({ member_code: '  ' })],
      appUrl,
      now,
    })
    expect(built).toEqual({ ok: false, code: MEMBERSHIP_CERTIFICATE_UNAVAILABLE })
  })

  it('el día de vencimiento sigue vigente y el siguiente no', () => {
    const row = membership({ expiration_date: '2026-11-16' })
    const issuedAt = new Date('2026-11-17T00:30:00Z')
    const current = buildMembershipCertificate({
      athlete,
      memberships: [row],
      appUrl,
      now: membershipCertificateNow('2026-11-16'),
      issuedAt,
    })
    const next = buildMembershipCertificate({
      athlete,
      memberships: [row],
      appUrl,
      now: membershipCertificateNow('2026-11-17'),
      issuedAt,
    })

    expect(current.ok).toBe(true)
    expect(current.certificate.issuedAt).toBe(issuedAt.toISOString())
    expect(next.ok).toBe(false)
    expect(next.code).toBe(MEMBERSHIP_CERTIFICATE_NOT_CURRENT)
  })

  it('un día calendario inválido no inventa otra fecha', () => {
    const fallback = new Date('2026-11-16T15:00:00-03:00')
    expect(membershipCertificateNow('no-es-fecha', fallback)).toBe(fallback)
    expect(membershipCertificateNow('', fallback)).toBe(fallback)
  })

  it('si hay dos vigentes, usa la que vence más tarde', () => {
    const built = buildMembershipCertificate({
      athlete,
      memberships: [
        membership({ id: 'mem-corta', expiration_date: '2026-12-31', member_code: 'CORTA' }),
        membership({ id: 'mem-larga', expiration_date: '2027-06-01', member_code: 'LARGA' }),
      ],
      appUrl,
      now,
    })
    expect(built.membershipId).toBe('mem-larga')
    expect(built.certificate.memberCode).toBe('LARGA')
  })

  it('el endpoint audita la emisión y no abre otra credencial', () => {
    const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
    const repository = readFileSync(
      resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
      'utf8',
    )
    const certificateModule = readFileSync(
      resolve(process.cwd(), 'server/modules/athletes/membershipCertificate.js'),
      'utf8',
    )
    expect(routes).toContain("'/me/membership-certificate'")
    expect(routes).toContain('recordMembershipCertificateIssued')
    expect(routes).toContain('MEMBERSHIP_CERTIFICATE_NOT_CURRENT')
    expect(certificateModule).toContain(
      "MEMBERSHIP_CERTIFICATE_NOT_CURRENT = 'MEMBERSHIP_NOT_CURRENT'",
    )
    expect(repository).toContain("action: 'membership_certificate.issued'")
    expect(repository).toContain('metadata: { memberCode: memberCode ?? null }')
    const start = routes.indexOf("router.get('/me/membership-certificate'")
    const certificateRoute = routes.slice(
      start,
      routes.indexOf("router.get('/me/documents'", start),
    )
    expect(certificateRoute).toContain('recordMembershipCertificateIssued')
    expect(certificateRoute).toContain('membershipCertificateNow(todayInBuenosAires()')
    expect(certificateRoute).toContain("res.set('Cache-Control', 'private, no-store')")
    expect(certificateRoute).not.toContain('rotate')
  })
})
