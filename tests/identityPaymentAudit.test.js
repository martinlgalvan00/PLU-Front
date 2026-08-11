import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  anonymousIdentityId,
  recordOperationalAuditEvent,
  requestAuditMetadata,
} from '../server/modules/audit/operationalAuditWriter.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260811140000_identity_payment_audit.sql'),
  'utf8',
)

describe('auditoria de identidad y pagos', () => {
  it('registra altas, sesiones y cada estado canonico del ledger', () => {
    expect(migration).toContain("check (source in ('email', 'payment', 'identity'))")
    expect(migration).toContain('athlete_account_operational_audit')
    expect(migration).toContain('athlete_session_operational_audit')
    expect(migration).toContain('athlete_payment_ledger_operational_audit')
    expect(migration).toContain('ticket_payment_ledger_operational_audit')
    expect(migration).toContain("'payment.' || new.status")
    expect(migration).toContain("new.status in ('rechazado', 'reembolsado')")
  })

  it('persiste solo metadata operativa y fingerprints para identidades anonimas', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const client = { from: vi.fn(() => ({ insert })) }
    const request = {
      ip: '203.0.113.10',
      get: vi.fn(() => 'Browser/1.0'),
    }

    await recordOperationalAuditEvent(client, {
      source: 'identity',
      action: 'auth.login_failed',
      entityType: 'staff_user',
      entityId: anonymousIdentityId('email', 'ana@example.com'),
      actorType: 'anonymous',
      status: 'failed',
      severity: 'warning',
      metadata: requestAuditMetadata(request, { method: 'password' }),
    })

    const row = insert.mock.calls[0][0]
    expect(row.entity_id).not.toContain('ana@example.com')
    expect(row.metadata.ipHash).not.toBe('203.0.113.10')
    expect(row.metadata).not.toHaveProperty('password')
    expect(row.metadata).not.toHaveProperty('cardToken')
  })
})
