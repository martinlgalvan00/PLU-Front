import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * promoCodeFinancingMigration.test.js — PLU ARG
 *
 * 20260828110000 puso el financiamiento en el combo del evento y 20260909100000
 * le dio la declaración del atleta. El interruptor que Precios muestra dentro
 * del alta de un código escribía el combo, así que financiar un código
 * financiaba a todos los del mismo torneo y se podía guardar sin ningún canal
 * manual —el atleta veía sólo la pasarela y el interruptor no hacía nada—.
 * Esta migración lo mueve al código y lo vuelve imposible de guardar inerte.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912100000_promo_code_financing.sql'),
  'utf8',
)

describe('financiamiento por código de promoción', () => {
  it('nace apagado: ningún código ya cargado empieza a financiar', () => {
    expect(migration).toContain('add column if not exists financed boolean not null default false')
  })

  it('no se puede guardar inerte: financiar exige un canal que se cobre a mano', () => {
    // El agujero reportado: financiado + sólo Mercado Pago = el atleta canjea,
    // paga con la pasarela (que acredita sola) y nunca delega nada.
    expect(migration).toContain('check (not financed or cardinality(manual_channels) > 0)')
    expect(migration).toContain('discount_codes_financed_channel_check')
  })

  it('una promo pública no financia: se aplica sola a todas las compras', () => {
    expect(migration).toContain("check (not financed or audience = 'code')")
    expect(migration).toContain('discount_codes_financed_audience_check')
  })

  it('el backfill hereda lo pactado y no abre canales que nadie eligió', () => {
    // Un código de oferta cuyo combo ya financiaba conserva la condición sólo
    // si declara un canal manual: prender los inertes abriría un medio de cobro
    // sin decisión humana.
    expect(migration).toContain('and cardinality(c.manual_channels) > 0')
    expect(migration).toContain('and not c.financed')
  })

  it('hay una sola regla, y corre con el canal ya escrito', () => {
    // `settle_manual_checkout_pricing` guarda `manual_payment_channel` DESPUÉS
    // de aplicar el cupón: dentro de `apply_discount_code_to_order` la orden
    // todavía no sabe por dónde se va a cobrar.
    expect(migration).toContain(
      'create or replace function plu_private.settle_order_financing(p_order_id uuid)',
    )
    expect(migration).toContain(
      "if v_order.method <> 'manual_link'\n     or coalesce(v_order.manual_payment_channel, 'bank_transfer')\n       not in ('bank_transfer', 'cash_pitbull') then",
    )
    // Los tres conceptos: afiliación, inscripción y combo.
    expect(
      migration.match(/v_order := plu_private\.settle_order_financing\(v_order\.id\);/g),
    ).toHaveLength(3)
  })

  it('monotónica: habilita y nunca revoca por su cuenta', () => {
    // Revocar es potestad de Finanzas al rechazar la declaración
    // (`reject_athlete_payment_order`, 20260909100000).
    expect(migration).toContain('set financing_allowed = true,')
    expect(migration).not.toContain('set financing_allowed = false')
  })

  it('la condición del código pesa en cualquier concepto, no sólo en el combo', () => {
    expect(migration).toContain('select coalesce(c.financed, false) into v_financed')
    expect(migration).toContain("if not coalesce(v_financed, false) and v_order.concept = 'combo'")
  })

  it('el alta lo acepta, lo valida y lo persiste', () => {
    expect(migration).toContain(
      "v_financed boolean := coalesce((p_code ->> 'financed')::boolean, false)",
    )
    expect(migration).toContain('if v_financed and cardinality(v_manual_channels) = 0 then')
    expect(migration).toContain("if v_financed and v_audience = 'public' then")
    expect(migration).toContain('financed = v_financed,')
    expect(migration).toContain('active, manual_channels, mercado_pago_enabled, financed')
  })

  it('la celda viaja a las tres pantallas que la necesitan', () => {
    // Panel (configuración), canje (el redeemer dice con qué se paga) y ficha
    // secreta (que lo anuncia antes de crear la orden).
    expect(migration).toContain("'financed', c.financed")
    expect(migration).toContain("'financed', v_code.financed")
    expect(migration).toContain("'financed', p_code.financed")
  })

  it('el canje deja de callar el medio de pago', () => {
    expect(migration).toContain(
      "'manualChannels', to_jsonb(coalesce(v_code.manual_channels, '{}'::text[]))",
    )
    expect(migration).toContain("'mercadoPagoEnabled', v_code.mercado_pago_enabled")
  })

  it('el simulador del panel muestra los dos callejones sin salida', () => {
    expect(migration).toContain("'payable', c.mercado_pago_enabled or cardinality(c.manual_channels) > 0")
    expect(migration).toContain(
      "'financingDeclarable', not c.financed or cardinality(c.manual_channels) > 0",
    )
  })

  it('la campaña se resincroniza cuando cambia el financiamiento', () => {
    // Sin la columna en la lista del trigger, cambiar sólo el financiamiento
    // dejaba la campaña contando la versión anterior.
    expect(migration).toContain("'financed', new.financed")
    expect(migration).toContain(
      'percent_off, fixed_price, fixed_price_manual, manual_channels, mercado_pago_enabled,\n  financed, starts_at, expires_at, active, archived_at',
    )
  })

  it('verifica el estado final antes de dar la migración por aplicada', () => {
    expect(migration).toContain("to_regprocedure('plu_private.settle_order_financing(uuid)') is null")
    expect(migration).toContain(
      'where financed and (cardinality(manual_channels) = 0 or audience <> \'code\')',
    )
  })
})
