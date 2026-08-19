import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828100000_promo_scheduling_channel_price_and_invites.sql',
  'utf8',
)

describe('migración: programación, precio por canal y exclusividad de promociones', () => {
  it('agrega la ventana y el precio manual con sus CHECK', () => {
    expect(migration).toContain('add column if not exists starts_at timestamptz')
    expect(migration).toContain('add column if not exists fixed_price_manual int')
    expect(migration).toContain(
      'check (fixed_price_manual is null or (fixed_price_manual > 0 and fixed_price_manual <= 10000000));',
    )
    expect(migration).toContain(
      "check (fixed_price_manual is null or kind = 'fixed_price');",
    )
    expect(migration).toContain(
      'check (starts_at is null or expires_at is null or expires_at > starts_at);',
    )
  })

  it('NO exige que el precio manual sea menor que el de Mercado Pago', () => {
    // El pedido explícito: pactar $120.000 por Mercado Pago y $120.000 por
    // transferencia es válido. Un CHECK comparando las dos columnas volvería a
    // cerrar ese caso, así que se verifica que no exista.
    const constraints = migration.match(/check \([^;]*fixed_price_manual[^;]*\)/g) ?? []
    expect(constraints.length).toBeGreaterThan(0)
    for (const constraint of constraints) {
      expect(constraint).not.toMatch(/fixed_price_manual\s*[<>]=?\s*fixed_price/)
      expect(constraint).not.toMatch(/fixed_price\s*[<>]=?\s*fixed_price_manual/)
    }
  })

  it('crea la tabla de invitados con email normalizado y RLS cerrada', () => {
    expect(migration).toContain('create table if not exists public.discount_code_invitations')
    expect(migration).toContain(
      'discount_code_id uuid not null references public.discount_codes(id) on delete cascade',
    )
    expect(migration).toContain('check (email = lower(email)')
    expect(migration).toContain(
      'constraint discount_code_invitations_uidx unique (discount_code_id, email)',
    )
    expect(migration).toContain(
      'alter table public.discount_code_invitations enable row level security;',
    )
    expect(migration).toContain(
      'revoke all on public.discount_code_invitations from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant select, insert, delete on public.discount_code_invitations to service_role;',
    )
  })

  it('el precio efectivo por canal usa el mismo criterio que resolve_channel_price', () => {
    // `manual_link` es el `method` con el que se guardan transferencia y
    // efectivo (storagePaymentMethod). Si acá se chequeara 'cash_pitbull' el
    // precio de la promo y el del catálogo discreparían para efectivo.
    expect(migration).toMatch(
      /create or replace function plu_private\.effective_fixed_price\(\s*p_payment_method text,\s*p_fixed_price int,\s*p_fixed_price_manual int\s*\)/,
    )
    expect(migration).toContain(
      "when p_payment_method = 'manual_link' and p_fixed_price_manual is not null",
    )
  })

  it('sin lista de invitados la promo sigue siendo abierta', () => {
    // Fail-open sólo para la ausencia de lista: es el comportamiento previo a
    // esta migración y lo que preserva las promos ya cargadas.
    expect(migration).toMatch(
      /create or replace function plu_private\.athlete_allowed_by_invitations\(\s*p_code_id uuid,\s*p_athlete_id uuid\s*\)/,
    )
    expect(migration).toMatch(
      /select not exists \(\s*select 1 from public\.discount_code_invitations i\s*where i\.discount_code_id = p_code_id\s*\) or exists \(/,
    )
    expect(migration).toContain('and i.email = lower(trim(a.email))')
  })

  it('dropea los overloads viejos antes de agregar el canal a las dos firmas', () => {
    expect(migration).toContain(
      'drop function if exists plu_private.resolve_public_promo(uuid, text, uuid, numeric);',
    )
    expect(migration).toContain(
      'drop function if exists public.athlete_preview_discount_code(uuid, uuid, text, text, int);',
    )
    const dropResolve = migration.indexOf(
      'drop function if exists plu_private.resolve_public_promo(uuid, text, uuid, numeric);',
    )
    const createResolve = migration.indexOf(
      'create or replace function plu_private.resolve_public_promo(',
    )
    expect(dropResolve).toBeGreaterThan(-1)
    expect(createResolve).toBeGreaterThan(dropResolve)
  })

  it('el resolver público filtra por apertura y por invitación', () => {
    expect(migration).toContain('and (c.starts_at is null or c.starts_at <= now())')
    expect(migration).toContain(
      'and plu_private.athlete_allowed_by_invitations(c.id, p_athlete_id)',
    )
  })

  it('el canje resuelve el precio con el canal de la orden y revalida bajo lock', () => {
    // El canal sale de `v_order.method`, el mismo valor que después usa el
    // settle: con otro canal el importe cambiaría entre el alta y el settle.
    expect(migration).toContain(
      'p_organization_id, p_applies_to, p_athlete_id, v_order.amount, v_order.method',
    )
    expect(migration).toContain(
      'plu_private.effective_fixed_price(v_order.method, v_code.fixed_price, v_code.fixed_price_manual)',
    )
    expect(migration).toContain(
      "or (v_code.starts_at is not null and v_code.starts_at > now())",
    )
    expect(migration).toContain("using errcode = 'PLU25'")
    expect(migration).toContain("using errcode = 'PLU26'")
  })

  it('el settle manual usa el mismo precio promocional por canal', () => {
    // Sin esto una promo con precio manual se aplicaba bien al crear la orden y
    // se pisaba con el importe de Mercado Pago al asentar el canal.
    const settleIndex = migration.indexOf(
      'create or replace function plu_private.settle_manual_checkout_pricing(',
    )
    expect(settleIndex).toBeGreaterThan(-1)
    const settleBody = migration.slice(settleIndex)
    expect(settleBody).toContain('plu_private.effective_fixed_price(')
    expect(settleBody).toContain(
      'p_payment_method, v_code.fixed_price, v_code.fixed_price_manual',
    )
    // El branch de Wise sigue saliendo antes de tocar cupones.
    expect(settleBody).toContain("if p_manual_payment_channel = 'wise_transfer' then")
    expect(settleBody.indexOf("if p_manual_payment_channel = 'wise_transfer' then")).toBeLessThan(
      settleBody.indexOf('plu_private.effective_fixed_price('),
    )
  })

  it('el preview distingue "no empezó" y "no invitado" de "no existe"', () => {
    expect(migration).toContain("'valid', false, 'reason', 'not_started'")
    expect(migration).toContain("'valid', false, 'reason', 'not_invited'")
    expect(migration).toContain("'valid', false, 'reason', 'not_found'")
  })

  it('el upsert deja la lista intacta si el payload no la trae', () => {
    // `invitees` ausente no puede convertir una promo exclusiva en abierta por
    // omisión: sólo un array presente reemplaza la lista.
    expect(migration).toContain("if jsonb_typeof(p_code -> 'invitees') = 'array' then")
    expect(migration).toContain('v_invitees := null;')
    expect(migration).toContain('if v_invitees is not null then')
    expect(migration).toContain('and not (email = any(v_invitees));')
    expect(migration).toContain('on conflict (discount_code_id, email) do nothing;')
  })

  it('el upsert valida la ventana y el precio manual sin compararlos entre sí', () => {
    expect(migration).toContain(
      'if v_starts is not null and v_expires is not null and v_expires <= v_starts then',
    )
    expect(migration).toContain(
      'if v_fixed_price_manual is not null\n       and (v_fixed_price_manual <= 0 or v_fixed_price_manual > 10000000) then',
    )
    // Una promo de porcentaje no arrastra el precio manual del tipo anterior.
    expect(migration).toMatch(/if v_kind = 'percent' then\s*v_fixed_price := null;\s*v_fixed_price_manual := null;/)
  })

  it('la configuración del panel expone ventana, precio manual e invitados', () => {
    expect(migration).toContain("'fixedPriceManual', c.fixed_price_manual")
    expect(migration).toContain("'startsAt', c.starts_at")
    expect(migration).toMatch(
      /'invitees', coalesce\(\(\s*select jsonb_agg\(i\.email order by i\.email\)\s*from public\.discount_code_invitations i\s*where i\.discount_code_id = c\.id\s*\), '\[\]'::jsonb\)/,
    )
  })

  it('verifica que los overloads viejos no sobrevivan', () => {
    expect(migration).toContain(
      "if to_regprocedure('plu_private.resolve_public_promo(uuid,text,uuid,numeric)') is not null then",
    )
    expect(migration).toContain(
      "if to_regprocedure('public.athlete_preview_discount_code(uuid,uuid,text,text,int)') is not null then",
    )
    expect(migration).toContain("if to_regclass('public.discount_code_invitations') is null then")
  })
})
