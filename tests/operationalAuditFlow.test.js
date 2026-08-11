import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeAuditEntry } from '../src/services/auditService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260810180000_operational_audit_email_flow.sql'),
  'utf8',
)

describe('auditoría operativa del flujo de afiliación', () => {
  it('captura en una bitácora append-only emails, webhooks e intentos de pago', () => {
    expect(migration).toContain('create table if not exists public.operational_event_logs')
    expect(migration).toContain('transactional_email_operational_audit')
    expect(migration).toContain('payment_integration_operational_audit')
    expect(migration).toContain('embedded_payment_operational_audit')
  })

  it('mantiene la bitácora técnica fuera de escritura pública', () => {
    expect(migration).toContain(
      'revoke all on public.operational_event_logs from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'revoke all on public.operational_audit_events from public, anon, authenticated;',
    )
  })

  it('detecta pagos aprobados sin derecho y afiliaciones sin confirmación', () => {
    expect(migration).toContain("l.template_key = 'affiliation_approved'")
    expect(migration).toContain('l.delivered_at >= m.updated_at')
    expect(migration).toContain("recovered.status = 'delivered'")
    expect(migration).toContain('transactional_email_logs_delivery_recovery_idx')
    expect(migration).toContain('athlete_payment_orders_membership_gap_idx')
    expect(migration).toContain("p.concept in ('membership', 'combo')")
    expect(migration).toContain("'approvedOrdersWithoutActiveMembership'")
    expect(migration).toContain("'activeMembershipsWithoutConfirmation'")
  })

  it('normaliza la evidencia técnica para la tabla del panel', () => {
    expect(normalizeAuditEntry({
      id: 'event-1',
      source: 'email',
      action: 'email.failed',
      entity_type: 'membership',
      entity_id: 'mem-1',
      actor_type: 'system',
      actor_id: 'ana@example.com',
      status: 'failed',
      severity: 'danger',
      metadata: {
        templateKey: 'affiliation_approved',
        errorCode: 'MISSING_PARAMS',
      },
      created_at: '2026-08-10T20:00:00.000Z',
    })).toMatchObject({
      source: 'email',
      status: 'failed',
      tone: 'danger',
      summary: [
        { field: 'templateKey', value: 'affiliation_approved' },
        { field: 'errorCode', value: 'MISSING_PARAMS' },
      ],
    })
  })
})
