import { describe, expect, it } from 'vitest'
import { getStatusMeta, normalizeStatus } from '../src/lib/status.js'

describe('status', () => {
  it('normaliza estados legacy', () => {
    expect(normalizeStatus('approved')).toBe('aprobado')
    expect(normalizeStatus('manual_pending')).toBe('validacion_manual')
  })

  it('asigna tono visual', () => {
    expect(getStatusMeta('aprobado').tone).toBe('success')
    expect(getStatusMeta('pendiente_pago').tone).toBe('warning')
    expect(getStatusMeta('rechazado').tone).toBe('danger')
  })
})
