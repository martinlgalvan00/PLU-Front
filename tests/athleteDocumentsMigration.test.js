import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20271110100000_athlete_documents.sql'),
  'utf8',
)

describe('migración de documentos de atleta', () => {
  it('crea la tabla con RLS activo, sin policies públicas, y el bucket privado', () => {
    expect(migration).toContain('create table if not exists public.athlete_documents')
    expect(migration).toContain('alter table public.athlete_documents enable row level security;')
    expect(migration).not.toMatch(/create policy[\s\S]*athlete_documents/)
    expect(migration).toContain("'athlete-documents'")
    expect(migration).toMatch(/insert into storage\.buckets[\s\S]*athlete-documents[\s\S]*false,/)
    expect(migration).toContain('409600')
  })

  it('grandfathered deja las cuentas existentes y las nuevas en false', () => {
    expect(migration).toContain('add column if not exists documents_grandfathered boolean not null default false')
    expect(migration).toContain('set documents_grandfathered = true')
  })

  it('reemplaza por (athlete_id, kind) y audita el registro', () => {
    expect(migration).toContain('unique (athlete_id, kind)')
    expect(migration).toContain('on conflict (athlete_id, kind) do update set')
    expect(migration).toContain("'athlete_document.registered'")
    expect(migration).toMatch(
      /revoke all on function public\.register_athlete_document\([\s\S]*?from public, anon, authenticated;/,
    )
  })

  it('verifica tabla, columna, bucket y RPC al final', () => {
    expect(migration).toContain("if not exists (select 1 from storage.buckets where id = 'athlete-documents') then")
    expect(migration).toContain("to_regclass('public.athlete_documents') is null")
    expect(migration).toContain(
      "'public.register_athlete_document(uuid,text,text,text,integer,text)'",
    )
  })
})
