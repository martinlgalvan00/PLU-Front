import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Reinscripción tras cancelada, segunda vuelta (20260911100000).
 *
 * 20260815200000/20260815201000 ya habían arreglado esto reactivando la fila
 * cancelada. 20260816120000 reescribió las dos RPC de checkout enteras para
 * reanudar el checkout pendiente y, al hacerlo, volvió al INSERT plano: en
 * producción el atleta con una orden vencida recibía en pantalla
 * `duplicate key value violates unique constraint
 * "event_registrations_event_id_athlete_id_key"`.
 *
 * Estos tests cuidan la propiedad, no la migración: mientras la definición
 * vigente de cada RPC sea la última del repo, ninguna puede tener su propio
 * INSERT contra event_registrations.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const migration = readFileSync(
  resolve(migrationsDir, '20260911100000_reregistration_after_cancellation.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  if (end === -1) throw new Error(`No se cerró el cuerpo de ${signature}`)
  return source.slice(start, end)
}

describe('migración 20260911100000 — reinscripción tras cancelada', () => {
  it('define el helper que reactiva la fila cancelada en vez de insertar otra', () => {
    const body = functionBody(migration, 'function plu_private.place_event_registration')
    expect(body).toContain('for update')
    expect(body).toMatch(/status = 'pendiente_pago'/)
    expect(body).toContain('insert into public.event_registrations')
    // La fila viva sigue siendo un conflicto de negocio, no una 23505.
    expect(body).toContain("errcode = 'PLU08'")
    expect(body).toContain("v_existing.status <> 'cancelada'")
  })

  it('la reactivación limpia lo que pertenecía a la inscripción muerta', () => {
    const body = functionBody(migration, 'function plu_private.place_event_registration')
    expect(body).toContain('event_day_id = null')
    expect(body).toContain('event_session_id = null')
    expect(body).toContain('manual_override_status = null')
    // El trigger de snapshot es BEFORE INSERT; en un UPDATE hay que refrescarlo.
    expect(body).toContain('plu_private.athlete_registration_snapshot(p_athlete_id)')
  })

  it('el compromiso competitivo se libera al salir de cancelada', () => {
    const body = functionBody(
      migration,
      'function plu_private.lock_registration_competition_selection',
    )
    expect(body).toMatch(/old\.status = 'cancelada' and new\.status <> 'cancelada'/)
    // Y sigue congelando la selección de una inscripción viva.
    expect(body).toContain('new.division := old.division')
    expect(body).toContain('new.bodyweight_kg := old.bodyweight_kg')
  })

  it('las dos RPC de checkout delegan y no insertan por su cuenta', () => {
    for (const signature of [
      'function public.create_competition_registration_v2',
      'function public.create_membership_registration_combo_order_core',
    ]) {
      const body = functionBody(migration, signature)
      expect(body).toContain('plu_private.place_event_registration')
      expect(body).not.toContain('insert into public.event_registrations')
    }
  })

  it('conserva el resto de las garantías de cada RPC', () => {
    const registration = functionBody(migration, 'function public.create_competition_registration_v2')
    const combo = functionBody(
      migration,
      'function public.create_membership_registration_combo_order_core',
    )
    for (const body of [registration, combo]) {
      // Idempotencia, cupo, evento inexistente y reanudación de la orden impaga.
      expect(body).toContain('idempotency_key')
      expect(body).toContain("errcode = 'PLU04'")
      expect(body).toContain("errcode = 'PLU02'")
      expect(body).toContain('resume_pending_event_registration_checkout')
    }
    // El combo no puede perder sus reglas de afiliación.
    expect(combo).toContain('membership_order_targets')
    expect(combo).toContain('El atleta ya tiene una afiliacion vigente o programada.')
  })

  it('la migración se verifica a sí misma contra la regresión', () => {
    expect(migration).toContain('$verification$')
    expect(migration).toContain('insert into public\\.event_registrations')
  })
})

describe('la definición vigente de cada RPC de checkout usa el helper', () => {
  // Toma la última migración que redefine cada función: si mañana alguien
  // reescribe una de las dos y vuelve al INSERT, este test lo ve sin importar
  // en qué archivo lo haga.
  it.each([
    'create_competition_registration_v2',
    'create_membership_registration_combo_order_core',
  ])('%s no vuelve al INSERT plano', (fnName) => {
    const signature = `create or replace function public.${fnName}(`
    const last = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) => readFileSync(resolve(migrationsDir, name), 'utf8').includes(signature))
      .at(-1)

    expect(last, `ninguna migración define ${fnName}`).toBeTruthy()
    const body = functionBody(
      readFileSync(resolve(migrationsDir, last), 'utf8'),
      `function public.${fnName}(`,
    )
    expect(body).toContain('plu_private.place_event_registration')
    expect(body).not.toContain('insert into public.event_registrations')
  })
})
