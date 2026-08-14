import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260817150000_admin_individual_hard_delete.sql'),
  'utf8',
)

describe('borrado administrativo individual', () => {
  it('elimina dependencias operativas y deja rastro de auditoría', () => {
    expect(migration).toContain('function public.delete_event_registration')
    expect(migration).toContain('delete from public.check_ins')
    expect(migration).toContain("'registration.deleted'")
    expect(migration).toContain('function public.delete_membership')
    expect(migration).toContain('delete from public.billing_subscriptions')
    expect(migration).toContain('delete from public.membership_cycles')
    expect(migration).toContain("'membership.deleted'")
    expect(migration).toContain('to service_role')
  })
})
