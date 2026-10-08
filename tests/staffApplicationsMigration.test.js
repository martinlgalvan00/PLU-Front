import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261130100000_staff_applications.sql'),
  'utf8',
)

describe('postulación al Cuerpo de Staff', () => {
  it('crea la tabla con RLS activo, sin policies públicas, y el bucket privado', () => {
    expect(migration).toContain('create table public.staff_applications (')
    expect(migration).toContain('alter table public.staff_applications enable row level security;')
    expect(migration).not.toMatch(/create policy[\s\S]*staff_applications/)
    expect(migration).toContain("'staff-application-documents',")
    expect(migration).toMatch(/insert into storage\.buckets[\s\S]*staff-application-documents[\s\S]*false,/)
  })

  it('un atleta no puede tener dos postulaciones pendientes a la vez', () => {
    expect(migration).toContain('create unique index staff_applications_pending_per_athlete_uidx')
    expect(migration).toContain("where status = 'pendiente';")
  })

  it('exige capacitación PDCA solo para el cuerpo técnico, nunca para el operativo', () => {
    expect(migration).toContain("if p_staff_body = 'tecnico' then")
    expect(migration).toContain('Falta el estado de capacitación técnica.')
    expect(migration).toContain(
      "elsif p_technical_training_status is not null then",
    )
    expect(migration).toContain(
      'El estado de capacitación técnica solo aplica al cuerpo técnico.',
    )
  })

  it('exige las dos declaraciones en true antes de insertar', () => {
    expect(migration).toContain(
      'data_accuracy_declared boolean not null default false check (data_accuracy_declared = true)',
    )
    expect(migration).toContain(
      'data_processing_consent boolean not null default false check (data_processing_consent = true)',
    )
    expect(migration).toContain('if p_data_accuracy_declared is distinct from true')
  })

  it('audita el envío y la revisión, y revoca todo salvo service_role', () => {
    expect(migration).toContain("'staff_application.submitted',")
    expect(migration).toContain("'staff_application.reviewed',")
    expect(migration).toMatch(
      /revoke all on function public\.submit_staff_application\([\s\S]*?from public, anon, authenticated;/,
    )
    expect(migration).toMatch(
      /revoke all on function public\.staff_review_application\(uuid, text, text, text\)\s*\n\s*from public, anon, authenticated;/,
    )
    expect(migration).toContain(
      'grant execute on function public.staff_review_application(uuid, text, text, text)',
    )
  })

  it('solo reabre una postulación pendiente para revisarla, no una ya resuelta', () => {
    expect(migration).toContain("where id = p_application_id and status = 'pendiente'")
    expect(migration).toContain('La postulación no existe o ya fue revisada.')
  })

  it('verifica tabla, bucket y las tres RPC al final', () => {
    expect(migration).toContain("if not exists (select 1 from storage.buckets where id = 'staff-application-documents') then")
    expect(migration).toContain("to_regclass('public.staff_applications') is null")
    expect(migration).toContain('to_regprocedure(')
    expect(migration).toContain("to_regprocedure('public.list_staff_applications(text,int)')")
    expect(migration).toContain(
      "to_regprocedure('public.staff_review_application(uuid,text,text,text)')",
    )
  })
})
