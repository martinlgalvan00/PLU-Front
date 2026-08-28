import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * redeemRespectsOwnRedemption.test.js — PLU ARG
 *
 * 20260928100000 cierra cuatro agujeros del rol del atleta con un
 * código-paquete, todos del mismo hilo: las guardas de cupo, ventana y estado
 * corrían ANTES de mirar si la persona que pregunta ya tiene su compra hecha.
 *
 *   1. El canje universal rechazaba con 'limit_reached' a quien llenó el cupo
 *      con SU PROPIA redención (un código personal de un solo uso, el caso más
 *      común), y con 'inactive'/'expired' a quien compró antes de la pausa o
 *      del vencimiento. El QR — el camino natural de vuelta al trámite — decía
 *      que no, mientras la ficha en Mi cuenta decía que sí.
 *   2. `athlete_unlock_offer_code` tenía la rama "ya comprada" DEBAJO de la
 *      ventana y las invitaciones: un código vencido con compra abierta
 *      contestaba 'expired' en vez de devolver la ficha.
 *   3. `athlete_list_offer_unlocks` exigía código activo y plan vigente para
 *      listar: pausar el código —o retirar el plan por una nueva versión de
 *      precio— borraba la ficha CON la compra en curso adentro (los datos
 *      bancarios, el diferir, la cuenta regresiva).
 *   4. `settle_order_financing` financiaba por cualquier canal manual aunque
 *      el código hubiera pactado uno solo.
 *
 * Estas afirmaciones son sobre la migración que los cierra.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260928100000_redeem_respects_own_redemption.sql'),
  'utf8',
)

describe('el canje respeta la redención propia', () => {
  it('detecta si el código abre ficha y si el atleta ya canjeó, antes de rechazar', () => {
    expect(migration).toContain('v_bundle_surface :=')
    expect(migration).toContain(
      "(v_code.kind in ('offer', 'access') and v_code.event_id is not null)",
    )
    expect(migration).toContain(
      "or (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo'",
    )
    expect(migration).toContain('into v_own_redemption')
  })

  it('el cascade de rechazos no corre para quien vuelve a su trámite', () => {
    expect(migration).toContain('if not (v_bundle_surface and v_own_redemption) then')
  })

  it('el conteo del cupo se calcula igual: el benefit lo publica', () => {
    // Con el bypass, `redeemedCount` y `remaining` tienen que seguir siendo
    // reales — el cascade ya no es el único lugar donde se contaba.
    expect(migration).toMatch(
      /if v_code\.max_redemptions is not null then\s*\n\s*select count\(\*\) into v_redeemed/,
    )
  })
})

describe('el unlock devuelve la compra hecha antes de juzgar la ventana', () => {
  it('la rama "ya comprada" corre antes que starts_at / expires_at / invitaciones', () => {
    const unlockBody = migration.slice(
      migration.indexOf('create or replace function public.athlete_unlock_offer_code'),
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
    )
    const alreadyRedeemed = unlockBody.indexOf('from public.discount_code_redemptions')
    const windowCheck = unlockBody.indexOf('v_code.starts_at is not null')
    const invitations = unlockBody.indexOf('athlete_allowed_by_invitations')
    expect(alreadyRedeemed).toBeGreaterThan(0)
    expect(windowCheck).toBeGreaterThan(0)
    expect(alreadyRedeemed).toBeLessThan(windowCheck)
    expect(alreadyRedeemed).toBeLessThan(invitations)
  })
})

describe('el listado mantiene viva la ficha de una compra en curso', () => {
  it('la redención propia lista aunque el código esté apagado o el plan retirado', () => {
    const listBody = migration.slice(
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
      migration.indexOf('create or replace function plu_private.settle_order_financing'),
    )
    expect(listBody).toContain('or exists (')
    expect(listBody).toContain('r.athlete_id = p_athlete_id')
  })

  it('archivar sigue siendo la baja dura: la rama de la redención no la sortea', () => {
    const listBody = migration.slice(
      migration.indexOf('create or replace function public.athlete_list_offer_unlocks'),
      migration.indexOf('create or replace function plu_private.settle_order_financing'),
    )
    expect(listBody).toContain('c.archived_at is null')
  })
})

describe('el financiamiento sólo prende sobre un canal declarado', () => {
  it('cruza el canal de la orden contra manual_channels del código', () => {
    expect(migration).toContain(
      "coalesce(v_order.manual_payment_channel, 'bank_transfer') = any(coalesce(c.manual_channels, '{}'::text[]))",
    )
  })

  it('la fuente del combo del evento queda como estaba: no declara canales', () => {
    expect(migration).toContain("coalesce(o.financed and o.audience = 'code', false)")
  })
})

describe('el preview queda consistente con el canje', () => {
  it('el plazo sólo viaja con financiamiento encendido', () => {
    expect(migration).toContain(
      "'financingTermDays', case when v_code.financed then coalesce(v_code.financing_term_days, 7) end",
    )
  })

  it('"ya lo usaste" se responde antes que "se agotó"', () => {
    const previewBody = migration.slice(
      migration.indexOf('create or replace function public.athlete_preview_discount_code'),
    )
    const alreadyUsed = previewBody.indexOf("'already_used'")
    const limitReached = previewBody.indexOf("'limit_reached'")
    expect(alreadyUsed).toBeGreaterThan(0)
    expect(limitReached).toBeGreaterThan(0)
    expect(alreadyUsed).toBeLessThan(limitReached)
  })
})
