import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeAuditEntry, auditActionTone, relatedEntityIds } from '../src/services/auditService.js'
import { registrationCheckinStatus, resolveRegistrationScan } from '../src/services/checkinScanService.js'
import { ApiError } from '../src/lib/api.js'

vi.mock('../src/services/athleteApi.js', () => ({
  getMembershipByCodeOrToken: vi.fn(),
  getStaffMembershipCredential: vi.fn(),
}))

const { getMembershipByCodeOrToken, getStaffMembershipCredential } = await import(
  '../src/services/athleteApi.js'
)

afterEach(() => {
  vi.resetAllMocks()
})

function credential({ checkedInAt = null, documentId } = {}) {
  return {
    athlete: { id: 'ath-1', fullName: 'Ana Torres', documentId },
    membership: { id: 'mem-1', status: 'activa', memberCode: 'PLU-ARG-2026-014' },
    registration: {
      id: 'reg-1',
      status: 'confirmada',
      category: 'Raw',
      division: 'Open',
      checkedInAt,
    },
  }
}

describe('estado de una credencial escaneada', () => {
  it('marca como usada una inscripción que ya registró ingreso', () => {
    // Regresión: la proyección pública no devolvía el check-in, así que
    // `checkedInAt` llegaba siempre null y una credencial ya usada se mostraba
    // lista para ingresar. El rechazo (PLU06) aparecía recién al apretar.
    expect(registrationCheckinStatus({ status: 'confirmada', checkedInAt: '2026-08-02T10:00:00Z' }))
      .toBe('usada')
    expect(registrationCheckinStatus({ status: 'confirmada', checkedInAt: null })).toBe('pagada')
  })

  it('no ofrece marcar ingreso dos veces sobre la misma credencial', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential({ checkedInAt: '2026-08-02T10:00:00Z' }))

    const result = await resolveRegistrationScan(
      { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(result.outcome).toBe('already_used')
    expect(result.canCheckIn).toBeFalsy()
  })

  it('habilita el ingreso cuando todavía no hubo check-in', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())

    const result = await resolveRegistrationScan(
      { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(result.outcome).toBe('ready')
    expect(result.canCheckIn).toBe(true)
  })
})

describe('proyección según quién escanea', () => {
  it('el staff pide la proyección con documento para cotejar el DNI físico', async () => {
    getStaffMembershipCredential.mockResolvedValue(credential({ documentId: '30111222' }))

    const result = await resolveRegistrationScan(
      { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026', staff: true },
    )

    expect(getStaffMembershipCredential).toHaveBeenCalledWith(
      'PLU-ARG-2026-014',
      'pitbull-classic-2026',
    )
    expect(getMembershipByCodeOrToken).not.toHaveBeenCalled()
    expect(result.row.document).toBe('30111222')
  })

  it('sin sesión de staff usa la proyección pública, sin PII', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())

    await resolveRegistrationScan(
      { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026' },
    )

    expect(getMembershipByCodeOrToken).toHaveBeenCalled()
    expect(getStaffMembershipCredential).not.toHaveBeenCalled()
  })

  it('si la sesión de staff perdió permiso, cae a la proyección pública', async () => {
    getStaffMembershipCredential.mockRejectedValue(new ApiError('sin permiso', { status: 403 }))
    getMembershipByCodeOrToken.mockResolvedValue(credential())

    const result = await resolveRegistrationScan(
      { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
      { defaultEventSlug: 'pitbull-classic-2026', staff: true },
    )

    expect(result.outcome).toBe('ready')
    expect(getMembershipByCodeOrToken).toHaveBeenCalled()
  })

  it('propaga un error real en vez de esconderlo detrás del fallback', async () => {
    getStaffMembershipCredential.mockRejectedValue(new ApiError('boom', { status: 500 }))

    await expect(
      resolveRegistrationScan(
        { code: 'PLU-ARG-2026-014', eventSlug: 'pitbull-classic-2026' },
        { defaultEventSlug: 'pitbull-classic-2026', staff: true },
      ),
    ).rejects.toThrow('boom')
  })
})

describe('normalización de la auditoría', () => {
  it('convierte una fila de domain_audit_logs a la forma del panel', () => {
    const entry = normalizeAuditEntry({
      id: 'log-1',
      action: 'membership.activated',
      entity_type: 'membership',
      entity_id: 'mem-1',
      actor_type: 'webhook',
      actor_id: 'mp-8891',
      metadata: { memberCode: 'PLU-ARG-2026-014', channel: 'mercado_pago' },
      created_at: '2026-08-02T12:00:00.000Z',
    })

    expect(entry).toMatchObject({
      id: 'log-1',
      action: 'membership.activated',
      entityType: 'membership',
      actorType: 'webhook',
      actorId: 'mp-8891',
      tone: 'success',
    })
    // `channel` no está en el resumen: la fila muestra lo operativo y el resto
    // queda en la metadata cruda.
    expect(entry.summary).toEqual([{ field: 'memberCode', value: 'PLU-ARG-2026-014' }])
  })

  it('tolera una acción que todavía no tiene tono ni copy asignados', () => {
    const entry = normalizeAuditEntry({
      id: 'log-2',
      action: 'algo.nuevo',
      entity_type: 'x',
      entity_id: 'y',
      actor_type: 'staff',
      metadata: null,
      created_at: '2026-08-02T12:00:00.000Z',
    })

    expect(entry.tone).toBe('default')
    expect(entry.summary).toEqual([])
    expect(auditActionTone('algo.nuevo')).toBe('default')
  })

  it('marca en rojo las revocaciones de derecho', () => {
    expect(auditActionTone('membership.revoked')).toBe('danger')
    expect(auditActionTone('registration.cancelled')).toBe('danger')
    expect(auditActionTone('membership.expired')).toBe('warning')
  })

  it('arma los ids relacionados de un atleta para una sola consulta', () => {
    const ids = relatedEntityIds({
      athleteId: 'ath-1',
      memberships: [{ id: 'mem-1' }],
      registrations: [{ id: 'reg-1' }, { id: null }],
      payments: [{ id: 'ord-1' }],
    })

    expect(ids).toEqual(['ath-1', 'mem-1', 'reg-1', 'ord-1'])
  })
})
