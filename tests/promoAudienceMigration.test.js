import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260827100000_promo_audience_public_or_code.sql'),
  'utf8',
)

describe('audiencia de una promoción: pública, con código o apagada', () => {
  it('agrega la audiencia como eje ortogonal a active, no como enum único', () => {
    // `active` lo sigue escribiendo el cierre automático por cupo. Si la
    // audiencia viviera dentro del mismo enum, agotarse borraría si la promo
    // era pública o restringida y reabrirla la dejaría en un estado inventado.
    expect(migration).toContain("add column if not exists audience text not null default 'code'")
    expect(migration).toContain("check (audience in ('public', 'code'))")
  })

  it('deja las promociones existentes como estaban: todas por código', () => {
    expect(migration).toContain("default 'code'")
    expect(migration).toContain('Quedaron promociones sin audiencia.')
  })

  it('impide que una promo pública abra canales manuales', () => {
    // Abrir transferencia o efectivo para todo el mundo es el interruptor de
    // canal, que vive en Acceso y habilitación. Una promo pública que además lo
    // hiciera sería el mismo control escondido en otra pantalla.
    expect(migration).toContain(
      'check (audience = \'code\' or cardinality(manual_channels) = 0)',
    )
    expect(migration).toContain('Una promoción pública no puede habilitar medios de pago manuales.')
  })

  it('resuelve la promo pública por mayor ahorro y con desempate determinístico', () => {
    expect(migration).toContain('create or replace function plu_private.resolve_public_promo')
    expect(migration).toContain('c.created_at desc')
    expect(migration).toContain('limit 1')
  })

  it('descarta del resolver lo que después vuelve a chequearse bajo lock', () => {
    expect(migration).toContain('c.expires_at is null or c.expires_at > now()')
    expect(migration).toContain('< c.max_redemptions')
    expect(migration).toContain('where r.discount_code_id = c.id and r.athlete_id = p_athlete_id')
  })

  it('nunca deja una orden en cero: el ahorro tiene que ser real', () => {
    expect(migration).toContain('between 1 and greatest(p_base - 1, 0)')
  })

  it('auto-aplica la promo pública cuando el checkout no manda código', () => {
    // Los tres wrappers de compra ya invocan apply_discount_code_to_order con
    // código o sin él, así que el auto-aplicado entra sin tocar el checkout.
    expect(migration).toContain(
      "v_automatic boolean := p_code is null or length(trim(p_code)) = 0",
    )
    expect(migration).toContain('v_code := plu_private.resolve_public_promo(')
  })

  it('con código falla ruidoso y sin código falla en silencio', () => {
    // La asimetría es deliberada: quien tipeó un código pidió ese precio y
    // cobrarle otro sería una estafa silenciosa; quien no tipeó nada no puede
    // perder la compra porque una promo no aplicaba.
    expect(migration).toContain("raise exception 'El código alcanzó el máximo de usos.'")
    expect(migration).toContain('if v_automatic then return null; end if;')
  })

  it('relee la promo bajo lock antes de canjearla', () => {
    expect(migration).toContain('select * into v_code from public.discount_codes where id = v_promo_id for update')
  })

  it('deja rastro de si el descuento vino de un código o de una promo pública', () => {
    expect(migration).toContain("'source', case when v_automatic then 'public_promo' else 'code' end")
  })

  it('previsualiza la promo pública sin código para que el precio no cambie al confirmar', () => {
    expect(migration).toContain("'no_public_promo'")
  })

  it('rechaza reactivar una promo sin cupo en vez de escribir un true sin efecto', () => {
    expect(migration).toContain('create or replace function public.staff_set_discount_code_state')
    expect(migration).toContain('Ampliá el cupo para volver a habilitarla.')
  })

  it('conserva el setter anterior como alias', () => {
    expect(migration).toContain('create or replace function public.staff_set_discount_code_active')
    expect(migration).toContain('select public.staff_set_discount_code_state(p_code_id, p_active, null, p_actor)')
  })

  it('cierra el CRUD del combo con una baja real', () => {
    expect(migration).toContain('create or replace function public.staff_delete_event_combo_offer')
    expect(migration).toContain('No se puede eliminar un combo con órdenes registradas.')
  })

  it('publica la audiencia al panel', () => {
    expect(migration).toContain("'audience', c.audience")
  })
})
