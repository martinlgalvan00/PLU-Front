import { describe, expect, it } from 'vitest'
import {
  AUDIT_CATEGORY_KEYS,
  UNCATEGORIZED,
  auditCategoryPatterns,
  categorizeAuditAction,
  likeToRegExp,
  withAuditCategory,
} from '../server/modules/audit/auditActionCategories.js'

/**
 * Un mismo hecho se asienta con dos nombres segun quien lo escriba: la
 * aplicacion usa `payment.webhook_failed` y el trigger de
 * `payment_integration_events` usa `payment_webhook.failed`. El panel arma sus
 * filtros con las acciones que existen de verdad, asi que ofrecia las dos
 * variantes sin decir que eran lo mismo: filtrar por una daba un resultado
 * incompleto y sin ninguna señal de que faltaba algo.
 *
 * Estas son las acciones reales presentes en la bitacora del sitio.
 */
const ACCIONES_REALES = [
  'auth.login_succeeded', 'auth.login_failed', 'auth.session_started', 'auth.session_ended',
  'account.created', 'athlete.deleted',
  'payment.order_created', 'payment.preference_created', 'payment.preference_reused',
  'payment.attempt_claimed', 'payment.provider_submitted', 'payment.applied', 'payment.aprobado',
  'payment.failed', 'payment.manual_rejection', 'payment_attempt.processing',
  'payment_attempt.submitted',
  'payment.webhook_received', 'payment.webhook_failed', 'payment_webhook.received',
  'payment_webhook.processing', 'payment_webhook.failed',
  'payment.reconciled', 'payment_reconciliation.reconciled', 'payment.recovery_run',
  'payment_brick.error',
  'email.sent', 'email.delivered', 'email.bounced',
  'membership.activated', 'membership_order.created',
  'registration.created', 'ticket.checked_in',
]

describe('categorias de auditoria', () => {
  it('agrupa las dos convenciones del mismo hecho', () => {
    // El caso que motivo todo: cinco nombres, dos convenciones, un solo hecho.
    for (const action of [
      'payment.webhook_received',
      'payment.webhook_failed',
      'payment_webhook.received',
      'payment_webhook.failed',
      'payment_webhook.processing',
    ]) {
      expect(categorizeAuditAction(action), action).toBe('webhook')
    }
  })

  it('separa la conciliacion del resto del cobro', () => {
    expect(categorizeAuditAction('payment.reconciled')).toBe('conciliacion')
    expect(categorizeAuditAction('payment_reconciliation.reconciled')).toBe('conciliacion')
    expect(categorizeAuditAction('payment.recovery_run')).toBe('conciliacion')
    expect(categorizeAuditAction('payment.applied')).toBe('cobro')
  })

  it('trata el error del Brick como falla del cliente y no del cobro', () => {
    // Pasa en el navegador del atleta: mezclarlo con las fallas del servidor
    // haria parecer que el backend rechaza cobros que nunca le llegaron.
    expect(categorizeAuditAction('payment_brick.error')).toBe('checkout_cliente')
  })

  it('clasifica toda accion real en una categoria conocida', () => {
    for (const action of ACCIONES_REALES) {
      expect(AUDIT_CATEGORY_KEYS, action).toContain(categorizeAuditAction(action))
    }
  })

  it('una accion desconocida cae en `otro` y no rompe', () => {
    // Una RPC nueva que empiece a auditar tiene que seguir apareciendo en el
    // listado aunque nadie haya actualizado este archivo.
    expect(categorizeAuditAction('cosa.nueva_sin_catalogar')).toBe(UNCATEGORIZED)
    expect(categorizeAuditAction(null)).toBe(UNCATEGORIZED)
    expect(categorizeAuditAction('')).toBe(UNCATEGORIZED)
  })

  it('el filtro resta las categorias anteriores', () => {
    /**
     * `cobro` incluye `payment.%`, que tambien captura `payment.webhook_failed`
     * —clasificado como `webhook` por ir antes—. Sin la resta, filtrar por
     * `cobro` traia filas que despues se mostraban en otra categoria: contra la
     * base real eran 2 de 200.
     */
    const cobro = auditCategoryPatterns('cobro')
    expect(cobro.include).toContain('payment.%')
    expect(cobro.exclude).toContain('payment.webhook\\_%')
    expect(cobro.exclude).toContain('payment\\_webhook.%')
    expect(cobro.exclude).toContain('payment\\_reconciliation.%')
  })

  it('la primera categoria no resta nada y `otro` no es filtrable', () => {
    expect(auditCategoryPatterns('acceso').exclude).toEqual([])
    // Es el complemento de todas las demas: no se puede expresar como un LIKE.
    expect(auditCategoryPatterns(UNCATEGORIZED)).toBeNull()
    expect(auditCategoryPatterns('inexistente')).toBeNull()
  })

  it('traduce los comodines y los literales escapados de LIKE', () => {
    // `\_` es un guion bajo literal; `_` suelto es comodin de un caracter. Sin
    // esta distincion, `payment\_webhook.%` tambien matchearia `paymentXwebhook`.
    expect(likeToRegExp('payment\\_webhook.%').test('payment_webhook.failed')).toBe(true)
    expect(likeToRegExp('payment\\_webhook.%').test('paymentXwebhook.failed')).toBe(false)
    // El punto del patron es literal, no el comodin de regex.
    expect(likeToRegExp('auth.%').test('authX')).toBe(false)
    expect(likeToRegExp('auth.%').test('auth.login_failed')).toBe(true)
  })

  it('filtrar y clasificar dan el mismo resultado', () => {
    /**
     * La invariante que sostiene la funcionalidad entera: si el filtro que se
     * empuja a la base y la clasificacion en memoria divergen, el panel muestra
     * filas etiquetadas con una categoria distinta de la que se pidio.
     *
     * Se reproduce el `include AND NOT exclude` del repositorio sobre las
     * acciones reales y se compara contra `categorizeAuditAction`.
     */
    for (const key of AUDIT_CATEGORY_KEYS) {
      const patterns = auditCategoryPatterns(key)
      if (!patterns) continue

      const seleccionadas = ACCIONES_REALES.filter((action) =>
        patterns.include.some((pattern) => likeToRegExp(pattern).test(action))
        && !patterns.exclude.some((pattern) => likeToRegExp(pattern).test(action)))

      const clasificadas = ACCIONES_REALES.filter((action) => categorizeAuditAction(action) === key)

      expect(seleccionadas.slice().sort(), `categoria ${key}`).toEqual(clasificadas.slice().sort())
    }
  })

  it('agrega la categoria sin tocar el resto del registro', () => {
    const rows = [{ id: 'a', action: 'payment_webhook.failed', metadata: { requestId: 'r-1' } }]
    expect(withAuditCategory(rows)).toEqual([
      {
        id: 'a',
        action: 'payment_webhook.failed',
        metadata: { requestId: 'r-1' },
        category: 'webhook',
      },
    ])
    // La bitacora es append-only: la categoria se agrega en la lectura y el
    // registro original queda intacto.
    expect(rows[0].category).toBeUndefined()
  })
})
