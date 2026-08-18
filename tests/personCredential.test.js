import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La credencial identifica a la PERSONA, no a un período de afiliación
 * (migración 20260806140000).
 *
 * Verificaciones de texto sobre el SQL, como el resto de los tests de
 * migración del repo. El comportamiento se validó ejecutando la migración
 * contra Postgres; esto es para que una edición futura no vuelva a colgar el
 * token de la membresía sin que nadie se entere.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260806140000_person_credential_token.sql'),
  'utf8',
)

const previous = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260802120000_membership_audit_credential_hardening.sql',
  ),
  'utf8',
)

const hardening = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260716000000_infrastructure_hardening.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

const lookup = functionBody(
  migration,
  'create or replace function plu_private.get_membership_by_code_or_token(',
)

describe('token de credencial por persona', () => {
  it('la versión vieja resolvía solo por token de membresía', () => {
    // Punto de partida: renovar creaba una fila nueva con token nuevo, así que
    // la card impresa del año anterior dejaba de ser la vigente.
    const before = functionBody(
      previous,
      'create or replace function plu_private.get_membership_by_code_or_token(',
    )
    expect(before).toContain('where qr_token = v_token')
    expect(before).not.toContain('credential_token')
  })

  it('agrega credential_token a athletes, único y con backfill explícito', () => {
    expect(migration).toContain('add column if not exists credential_token uuid')
    expect(migration).toContain('set credential_token = gen_random_uuid()')
    expect(migration).toContain('alter column credential_token set not null')
    expect(migration).toContain('athletes_credential_token_uidx')
  })

  it('resuelve por token de persona', () => {
    expect(lookup).toContain('where credential_token = v_token')
  })

  it('mantiene el token de membresía y el member_code como fallback', () => {
    // Las credenciales ya emitidas tienen que seguir funcionando.
    expect(lookup).toContain('where m.qr_token = v_token')
    expect(lookup).toContain('where m.member_code = p_code')
  })

  it('devuelve la afiliación vigente, no la primera que matchee', () => {
    expect(lookup).toContain("m.status = 'activa'")
    expect(lookup).toContain('m.expiration_date, current_date - 1) >= current_date')
  })

  it('sigue sin filtrar ningún token en la proyección pública', () => {
    // El member_code es correlativo: devolver un token permitiría cosecharlos.
    const projection = lookup.slice(lookup.indexOf('return jsonb_build_object'))
    expect(projection).not.toContain('credential_token')
    expect(projection).not.toContain('qr_token')
  })

  it('lista las inscripciones cuando el QR se escanea sin evento', () => {
    expect(lookup).toContain("'registrations', v_registrations")
    expect(lookup).toContain("e.status <> 'finalizado'")
  })

  it('la proyección de staff toma el documento del atleta ya resuelto', () => {
    // Antes repetía la búsqueda por token; con tres formatos aceptados, las dos
    // ramas se iban a desincronizar.
    const staff = functionBody(
      migration,
      'create or replace function public.staff_get_membership_by_code_or_token(',
    )
    expect(staff).toContain("(v_result -> 'athlete' ->> 'id')::uuid")
    expect(staff).not.toContain('where qr_token = v_token')
  })

  it('expone rotación del token de persona, con auditoría', () => {
    const rotate = functionBody(
      migration,
      'create or replace function public.staff_rotate_athlete_credential_token(',
    )
    expect(rotate).toContain('set credential_token = gen_random_uuid()')
    expect(rotate).toContain("'athlete.credential_rotated'")
    expect(migration).toContain(
      'grant execute on function public.staff_rotate_athlete_credential_token(uuid, text)\n  to service_role;',
    )
  })
})

describe('vigencia de la afiliación', () => {
  it('la versión vieja proyectaba las fechas de cuando se creó la orden', () => {
    // Una transferencia aprobada tres semanas después arrancaba retroactiva y
    // el socio perdía esas semanas.
    const before = functionBody(
      hardening,
      'create or replace function public.project_membership_order_target()',
    )
    // El ciclo se insertaba con las fechas del target tal cual, sin recalcular
    // nada contra la fecha de acreditación.
    expect(before).toContain("v_target.starts_at, v_target.ends_at, 'active'")
    expect(before).not.toContain('v_duration')
    expect(before).not.toContain('update public.membership_order_targets')
  })

  it('se cuenta desde el pago y conserva la duración del plan', () => {
    const trigger = functionBody(
      migration,
      'create or replace function public.project_membership_order_target()',
    )
    expect(trigger).toContain('v_duration := greatest(v_target.ends_at - v_target.starts_at, 1)')
    expect(trigger).toContain('v_end := v_start + v_duration')
    expect(trigger).toContain('update public.membership_order_targets')
  })

  it('respeta la fecha futura de una renovación programada', () => {
    const trigger = functionBody(
      migration,
      'create or replace function public.project_membership_order_target()',
    )
    expect(trigger).toContain('if v_target.starts_at > current_date then')
    expect(trigger).toContain('v_start := v_target.starts_at')
  })

  it('encadena después de la cobertura paga que siga vigente', () => {
    const trigger = functionBody(
      migration,
      'create or replace function public.project_membership_order_target()',
    )
    expect(trigger).toContain('select max(c.ends_at) into v_covered_until')
    expect(trigger).toContain('c.order_id <> new.id')
  })
})
