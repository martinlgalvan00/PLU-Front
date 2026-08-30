import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20261016100000_resource_hygiene_and_retention_indexes.sql'),
  'utf8',
)
const photoScript = readFileSync(resolve('scripts/recompress-athlete-photos.mjs'), 'utf8')

describe('higiene de recursos Supabase', () => {
  it('usa indices BRIN chicos para las purgas cronologicas', () => {
    expect(migration).toContain('analytics_events_retention_brin_idx')
    expect(migration).toContain('operational_event_logs_retention_brin_idx')
    expect(migration).toContain('using brin')
    expect(migration).toContain('pages_per_range = 32')
  })

  it('purga solo sesiones y cuotas inertes con margen de diagnostico', () => {
    expect(migration).toContain('create or replace function public.purge_ephemeral_history')
    expect(migration).toContain('greatest(7, coalesce(p_session_grace_days, 30))')
    expect(migration).toContain('greatest(30, coalesce(p_quota_days, 120))')
    expect(migration).not.toMatch(/delete from public\.(operational_event_logs|domain_audit_logs)/)
  })

  it('mantiene la higiene dentro del job nocturno existente', () => {
    expect(migration).toContain("where jobname = 'plu-storage-nightly'")
    expect(migration).toContain('select public.purge_ephemeral_history();')
    expect(migration).toContain(
      'revoke all on function public.purge_ephemeral_history(integer, integer)',
    )
  })

  it('valida la imagen decodificada y no impone un minimo falso de 1 KB', () => {
    expect(photoScript).toContain("outMeta.format !== 'webp'")
    expect(photoScript).not.toContain('output.length < 1024')
  })
})
