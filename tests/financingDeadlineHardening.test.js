import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * financingDeadlineHardening.test.js — PLU ARG
 *
 * 20260922100000 trajo el plazo de pago del financiamiento y la baja
 * automática, pero se quedó a mitad de camino en tres cosas que sólo se ven con
 * datos reales encima:
 *
 *   1. El reloj exige `financed_payment_due_at is not null` y esa columna sólo
 *      se escribe al declarar el pago. Toda orden que ya había declarado quedó
 *      exenta para siempre — justo los casos que la migración decía venir a
 *      resolver.
 *   2. Las dos vías de revocación comparten `revoke_financed_order`, que
 *      asentaba siempre `payment.rejected_manually`: en la bitácora una baja
 *      por reloj era indistinguible de un rechazo de Finanzas.
 *   3. `exception when others then null` descartaba los fallos del barrido sin
 *      contarlos: una orden imposible de revocar se reintentaba cada 3 minutos
 *      para siempre y nadie se enteraba.
 *
 * Estas afirmaciones son sobre la migración que los cierra.
 */

const PREVIOUS = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260922100000_financed_payment_deadline.sql'),
  'utf8',
)

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260923100000_financing_deadline_hardening.sql'),
  'utf8',
)

describe('endurecimiento del vencimiento de financiamiento', () => {
  describe('la bitácora distingue la persona del reloj', () => {
    it('el asiento se elige por el código de cierre, no por el actor', () => {
      // Por `cancellation_code` y no por `actor_type`: es el mismo dato que ya
      // queda sellado en la fila de la orden, así que la bitácora no puede
      // contradecir lo que dice el registro.
      expect(migration).toContain(
        "when p_cancellation_code = 'financing_term_expired' then 'payment.financing_term_expired'",
      )
      expect(migration).toContain("else 'payment.rejected_manually'")
    })

    it('el rechazo humano conserva su asiento de siempre', () => {
      // La otra vía no cambia de nombre: hay tableros y tests que la leen.
      expect(PREVIOUS).toContain("'payment.rejected_manually'")
      expect(migration).toContain("'payment.rejected_manually'")
    })

    it('deja de asentar el nombre a mano y pasa a resolverlo', () => {
      // La versión anterior tenía el literal pegado a `record_domain_audit`.
      expect(PREVIOUS).toContain(
        "    'payment.rejected_manually', 'athlete_payment_order', p_order_id::text,",
      )
      expect(migration).toContain(
        "    v_action, 'athlete_payment_order', p_order_id::text,",
      )
    })

    it('el asiento explica con qué plazo y contra qué fecha se cortó', () => {
      // Sin estos dos campos una baja automática no se puede reconstruir: no
      // hay forma de saber si el plazo era de 7 o de 30 días.
      expect(migration).toContain("'financingTermDays', v_order.financing_term_days")
      expect(migration).toContain("'financedPaymentDueAt', v_order.financed_payment_due_at")
    })
  })

  describe('el barrido cuenta y explica lo que no pudo cortar', () => {
    it('ya no descarta el error en silencio', () => {
      expect(PREVIOUS).toMatch(/exception when others then\s*\n\s*null;/)
      expect(migration).not.toMatch(/exception when others then\s*\n\s*null;/)
    })

    it('devuelve los fallos junto con los vencimientos', () => {
      expect(PREVIOUS).toContain("return jsonb_build_object('expiredOrders', v_count);")
      expect(migration).toContain(
        "return jsonb_build_object('expiredOrders', v_count, 'failedOrders', v_failed);",
      )
    })

    it('asienta cada fallo con su sqlstate para que sea rastreable', () => {
      expect(migration).toContain("'payment.financing_expiry_failed'")
      expect(migration).toContain("jsonb_build_object('sqlstate', v_state, 'message', v_error)")
    })

    it('una fila que cambió de estado en el medio sigue sin tirar el lote abajo', () => {
      // El `skip locked` y el bloque por iteración son la razón de existir del
      // manejador: contarlo no puede volver el barrido frágil.
      expect(migration).toContain('for update of o skip locked')
      expect(migration).toContain('exception when others then')
      expect(migration).toContain('v_failed := v_failed + 1;')
    })

    it('sigue mirando sólo las órdenes financiadas, declaradas y abiertas', () => {
      // El filtro es el contrato del reloj: una orden sin declaración no tiene
      // plazo que correr, y una cerrada ya no tiene nada que revocar.
      expect(migration).toContain('where o.financing_allowed')
      expect(migration).toContain('and o.financed_entitlements_at is not null')
      expect(migration).toContain('and o.financed_entitlements_revoked_at is null')
      expect(migration).toContain('and o.financed_payment_due_at <= p_now')
      expect(migration).toContain("and o.status in ('pendiente', 'validacion_manual')")
    })
  })

  describe('las órdenes ya declaradas entran al reloj', () => {
    it('la migración anterior no escribía el vencimiento en ninguna orden vieja', () => {
      // La prueba del agujero: la única escritura de la columna estaba dentro
      // de `athlete_confirm_manual_payment`, es decir, hacia adelante.
      const backfills = PREVIOUS.match(/^update public\.athlete_payment_orders$/gm) ?? []
      expect(backfills).toHaveLength(0)
      expect(PREVIOUS).toContain('financed_payment_due_at = case')
    })

    it('resuelve el plazo con la misma precedencia que settle_order_financing', () => {
      // La foto de la orden, después el código, después el combo restringido y
      // 7 días como último recurso. Si el backfill inventara su propia regla,
      // dos órdenes idénticas vencerían en fechas distintas.
      expect(migration).toContain(
        'v_term := coalesce(v_row.financing_term_days, v_row.code_term, v_row.combo_term, 7);',
      )
      expect(migration).toContain('left join public.discount_codes c on c.id = o.discount_code_id')
      expect(migration).toContain('join public.event_combo_offers co')
    })

    it('sólo toca las que están fuera del reloj y siguen abiertas', () => {
      expect(migration).toMatch(
        /where o\.financing_allowed\n\s+and o\.financed_entitlements_at is not null\n\s+and o\.financed_entitlements_revoked_at is null\n\s+and o\.financed_payment_due_at is null\n\s+and o\.status in \('pendiente', 'validacion_manual'\)/,
      )
    })

    it('una deuda ya vencida recibe una ventana antes de que el reloj la corte', () => {
      // Sin el piso, el deploy daría de baja afiliaciones e inscripciones de
      // gente real dentro de los 3 minutos y sin ningún aviso. La baja sigue
      // siendo correcta; lo que se agrega es el tiempo para revisar la lista.
      expect(migration).toContain("v_grace interval := interval '3 days';")
      expect(migration).toContain('if v_due <= now() then')
      expect(migration).toContain('v_due := now() + v_grace;')
    })

    it('las que todavía están en plazo conservan su fecha real', () => {
      expect(migration).toContain(
        "v_real_due := v_row.financed_entitlements_at + (v_term * interval '1 day');",
      )
      expect(migration).toContain('v_due := v_real_due;')
    })

    it('cada orden incorporada queda asentada para que Finanzas la pueda revisar', () => {
      expect(migration).toContain("'payment.financing_term_backfilled'")
      expect(migration).toContain("'alreadyOverdue', v_due <> v_real_due")
    })
  })

  describe('verificación', () => {
    it('falla si quedó alguna orden financiada y declarada fuera del reloj', () => {
      // Es la afirmación central: después de correr, el agujero que cierra la
      // migración tiene que estar cerrado de verdad.
      expect(migration).toContain(
        'raise exception \'Quedaron ordenes financiadas declaradas sin vencimiento de plazo.\'',
      )
    })

    it('exige que el barrido siga programado en pg_cron', () => {
      // El job de Express es un refuerzo: Vercel no garantiza un proceso
      // residente, así que la fuente es el propio Postgres.
      expect(migration).toContain("where jobname = 'expire-domain-orders-sweep'")
      expect(migration).toContain("and command like '%expire_financed_payment_orders%'")
    })

    it('no regala la ejecución del barrido a un rol público', () => {
      expect(migration).toContain(
        'revoke all on function public.expire_financed_payment_orders(timestamptz)\n  from public, anon, authenticated;',
      )
      expect(migration).toContain(
        'revoke all on function plu_private.revoke_financed_order(uuid, text, text, text, text)\n  from public, anon, authenticated;',
      )
    })
  })
})
