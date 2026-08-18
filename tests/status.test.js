import { describe, expect, it } from 'vitest'
import {
  getStatusMeta,
  isGateAccessReady,
  isRegistrationAdmitted,
  normalizeStatus,
} from '../src/lib/status.js'

describe('status', () => {
  it('normaliza estados legacy', () => {
    expect(normalizeStatus('approved')).toBe('aprobado')
    expect(normalizeStatus('manual_pending')).toBe('validacion_manual')
  })

  it('asigna tono visual', () => {
    expect(getStatusMeta('aprobado').tone).toBe('success')
    expect(getStatusMeta('pendiente_pago').tone).toBe('warning')
    expect(getStatusMeta('rechazado').tone).toBe('danger')
    expect(getStatusMeta('registrado').tone).toBe('info')
    expect(getStatusMeta('proximamente').tone).toBe('info')
  })

  it('isRegistrationAdmitted solo para pagada/confirmada', () => {
    expect(isRegistrationAdmitted('confirmada')).toBe(true)
    expect(isRegistrationAdmitted('pagada')).toBe(true)
    expect(isRegistrationAdmitted('pendiente_pago')).toBe(false)
  })

  it('isGateAccessReady exige afiliación solo si el evento la pide', () => {
    expect(
      isGateAccessReady({
        registrationStatus: 'confirmada',
        requiresMembership: true,
        membershipCurrent: false,
      }),
    ).toBe(false)

    expect(
      isGateAccessReady({
        registrationStatus: 'confirmada',
        requiresMembership: true,
        membershipCurrent: true,
      }),
    ).toBe(true)

    expect(
      isGateAccessReady({
        registrationStatus: 'confirmada',
        requiresMembership: false,
        membershipCurrent: false,
      }),
    ).toBe(true)

    expect(
      isGateAccessReady({
        registrationStatus: 'pendiente_pago',
        requiresMembership: false,
        membershipCurrent: true,
      }),
    ).toBe(false)
  })
})
