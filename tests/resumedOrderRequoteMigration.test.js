import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El incidente que fija esta prueba: una inscripción `pendiente_pago` cuya orden
 * se había creado con `ONLY-PITBULL` (precio fijo 85.000) siguió cobrando 85.000
 * después de canjear `ONLY-PITBULL-MP2026` (92.500, sólo Mercado Pago). El
 * checkout anunciaba 92.500 —el preview lo resolvía bien— y la orden volvía con
 * el código viejo, ya archivado.
 *
 * Lo que se protege acá es la forma de la corrección, no un número: que los tres
 * wrappers de alta pasen por la recotización, que la recotización suelte el
 * código stale y que el rechazo silencioso ya no exista. El recorrido con
 * importes reales vive en `supabase/tests/resumed_order_requote_flow.sql`
 * (`npm run db:verify:requote`), que necesita base.
 */
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261019130000_resumed_order_requotes_its_code.sql'),
  'utf8',
)
/** Cuerpo de una función definida en la migración, hasta su `$$;` de cierre. */
function functionBody(signature) {
  const start = migration.indexOf(signature)
  if (start === -1) return ''
  const end = migration.indexOf('\n$$;', start)
  return migration.slice(start, end === -1 ? undefined : end)
}

const rpcStatusMap = readFileSync(resolve(process.cwd(), 'server/lib/supabaseRpc.js'), 'utf8')
const smoke = readFileSync(
  resolve(process.cwd(), 'supabase/tests/resumed_order_requote_flow.sql'),
  'utf8',
)

describe('recotización de la orden abierta al aplicar un código', () => {
  it('define las dos funciones que sueltan y recotizan', () => {
    expect(migration).toContain(
      'create or replace function plu_private.release_order_discount(p_order_id uuid)',
    )
    expect(migration).toContain('create or replace function plu_private.requote_open_order(')
  })

  it('los tres wrappers de alta recotizan en vez de aplicar el código a ciegas', () => {
    for (const wrapper of [
      'create or replace function public.create_competition_registration_v3(',
      'create or replace function public.create_membership_order_v4(',
      'create or replace function public.create_membership_registration_combo_order(',
    ]) {
      const body = functionBody(wrapper)
      expect(body, `falta el wrapper ${wrapper}`).not.toBe('')
      expect(body, `${wrapper} no recotiza`).toContain('plu_private.requote_open_order(')
      // La llamada pelada era el rechazo silencioso: `perform` descartaba el
      // `{applied: false, reason: 'already_applied'}` que devolvía la función.
      // El único lugar donde se aplica el código sigue siendo la recotización.
      expect(body, `${wrapper} aplica el código a ciegas`).not.toContain(
        'public.apply_discount_code_to_order(',
      )
    }
    // El combo tiene dos ramas (retry por clave y reanudación del core), así que
    // son cuatro puntos de recotización en total.
    const callSites = migration.match(/plu_private\.requote_open_order\(/g)?.length ?? 0
    expect(callSites).toBeGreaterThanOrEqual(4)
  })

  it('suelta el código sólo mientras la orden todavía se puede recotizar', () => {
    expect(migration).toContain("v_order.status not in ('creado', 'pendiente', 'validacion_manual')")
    expect(migration).toContain('v_order.payment_proof_path is not null')
    expect(migration).toContain('v_order.manual_payment_declared_at is not null')
    // Un intento embebido en vuelo bloquea: es el mismo corte que usa
    // `resume_pending_event_registration_checkout` para cambiar de medio.
    expect(migration).toContain("a.status in ('processing', 'submitted')")
  })

  it('devuelve el cupo y la base, y no reusa la preferencia del importe anterior', () => {
    expect(migration).toContain('delete from public.discount_code_redemptions')
    expect(migration).toContain('set amount = amount + v_released')
    expect(migration).toContain('provider_preference_id = null')
    expect(migration).toContain("'payment_order.discount_released'")
  })

  it('no deja que un código archivado o apagado siga cotizando la orden', () => {
    expect(migration).toContain('c.archived_at is null')
    expect(migration).toContain('into v_sellable')
    expect(migration).toContain('not coalesce(v_sellable, false)')
  })

  it('corta con motivo en vez de cobrar otro importe que el anunciado', () => {
    expect(migration).toContain("errcode = 'PLU30'")
    // Un código pedido que no quedó aplicado es un contrato roto, no una compra
    // sin cupón: antes salía en silencio y el atleta pagaba otro precio.
    expect(migration).toContain('no se pudo aplicar a esta orden')
    expect(rpcStatusMap).toMatch(/PLU30:\s*409/)
  })

  it('la verificación de la migración se rompe si alguien copia un cuerpo viejo', () => {
    expect(migration).toContain('pg_get_functiondef')
    expect(migration).toContain("v_def not like '%requote_open_order%'")
    expect(migration).toContain("v_def like '%perform public.apply_discount_code_to_order%'")
  })

  it('el smoke reproduce el incidente con los importes reales', () => {
    expect(smoke.trimStart().startsWith('--')).toBe(true)
    expect(smoke).toContain('begin;')
    expect(smoke).toContain('rollback;')
    // La orden arranca en 100.000 (base Mercado Pago), cae a 85.000 con el
    // código viejo y tiene que terminar en 92.500 con el nuevo.
    expect(smoke).toContain("'fixedPrice', 85000")
    expect(smoke).toContain("'fixedPrice', 92500")
    expect(smoke).toContain("update public.discount_codes set archived_at = now()")
    expect(smoke).toContain("v_applied ->> 'reason' is distinct from 'already_applied'")
    expect(smoke).toContain('v_order.amount <> 92500')
  })
})
