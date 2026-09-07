import { HttpError } from '../../lib/errors.js'

export const DEFAULT_MEMBERSHIP_RENEWAL_OFFSETS = Object.freeze([30, 7, 0])

/**
 * supabaseNotificationRepository.js — PLU ARG
 *
 * Persistencia de la cola de emails sobre `transactional_email_logs` y
 * `email_suppressions` (ver migración 20260730120000).
 *
 * La idempotencia se apoya en el índice único de `idempotency_key`: el insert
 * se intenta siempre y el conflicto 23505 se trata como "ya existía". Chequear
 * antes con un select tendría una ventana de carrera entre dos instancias
 * procesando el mismo webhook de Mercado Pago.
 */

function assertResult(result, message) {
  if (result.error) throw new HttpError(503, result.error.message || message)
  return result.data
}

export function createSupabaseNotificationRepository(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no está configurado.')

  return {
    /**
     * Reserva la fila. Va directo al INSERT y usa el conflicto 23505 como
     * señal de duplicado, en vez de consultar antes: el caso normal (email
     * nuevo) pasa de dos viajes a la base a uno solo, y el SELECT previo
     * tampoco evitaba la carrera entre instancias porque la ventana seguía
     * abierta. El índice único de `idempotency_key` es la garantía real.
     */
    async beginEmail(input) {
      const result = await client
        .from('transactional_email_logs')
        .insert({
          idempotency_key: input.idempotencyKey,
          template_key: input.type,
          template_id: input.templateId ? Number(input.templateId) : null,
          recipient_email: input.to,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          category: input.category ?? null,
          status: 'processing',
          payload: input.params ?? {},
          last_attempt_at: new Date().toISOString(),
        })
        .select()
        .single()

      // 23505: otra instancia ganó la carrera con la misma idempotency_key.
      if (result.error?.code === '23505') {
        const duplicate = assertResult(
          await client
            .from('transactional_email_logs')
            .select('*')
            .eq('idempotency_key', input.idempotencyKey)
            .single(),
          'No se pudo recuperar el email idempotente.',
        )
        return { emailLog: duplicate, created: false }
      }
      return { emailLog: assertResult(result, 'No se pudo registrar el email.'), created: true }
    },

    async completeEmail(
      id,
      { status, response = null, error = null, errorCode = null, attempt, nextRetryAt } = {},
    ) {
      const patch = {
        status,
        provider_message_id: response?.messageId ?? null,
        provider_response: response,
        error,
        error_code: errorCode,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }
      // `next_retry_at` solo tiene sentido en 'retrying'; en cualquier otro
      // estado se limpia para que el job no vuelva a levantar la fila.
      patch.next_retry_at = status === 'retrying' ? nextRetryAt : null
      if (Number.isInteger(attempt)) {
        patch.attempts_count = attempt
        patch.last_attempt_at = new Date().toISOString()
      }

      return assertResult(
        await client.from('transactional_email_logs').update(patch).eq('id', id).select().single(),
        'No se pudo finalizar el email.',
      )
    },

    /** Direcciones que no deben recibir más envíos. */
    async findSuppression(email) {
      return assertResult(
        await client
          .from('email_suppressions')
          .select('email, reason, source, created_at')
          .eq(
            'email',
            String(email ?? '')
              .trim()
              .toLowerCase(),
          )
          .maybeSingle(),
        'No se pudo consultar la lista de supresión.',
      )
    },

    /**
     * Carga en una sola consulta las supresiones de un lote de direcciones.
     * Un anuncio a 500 socios hacía 500 consultas puntuales; ahora hace una.
     * Devuelve un Map para que el dispatcher resuelva en memoria.
     */
    async findSuppressions(emails) {
      const unique = [
        ...new Set(
          (emails ?? [])
            .map((e) =>
              String(e ?? '')
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        ),
      ]
      if (unique.length === 0) return new Map()

      const found = new Map()
      // Se pagina porque `in()` viaja en la query string y una lista muy
      // larga desborda el límite de URL de PostgREST.
      const CHUNK = 200
      for (let i = 0; i < unique.length; i += CHUNK) {
        const rows = assertResult(
          await client
            .from('email_suppressions')
            .select('email, reason, source, created_at')
            .in('email', unique.slice(i, i + CHUNK)),
          'No se pudo consultar la lista de supresión.',
        )
        for (const row of rows ?? []) found.set(row.email, row)
      }
      return found
    },

    async suppress({ email, reason, source = 'manual', detail = null }) {
      return assertResult(
        await client
          .from('email_suppressions')
          .upsert(
            {
              email: String(email ?? '')
                .trim()
                .toLowerCase(),
              reason,
              source,
              detail,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'email' },
          )
          .select()
          .single(),
        'No se pudo suprimir la dirección.',
      )
    },

    async removeSuppression(email) {
      assertResult(
        await client
          .from('email_suppressions')
          .delete()
          .eq(
            'email',
            String(email ?? '')
              .trim()
              .toLowerCase(),
          ),
        'No se pudo quitar la supresión.',
      )
    },

    /** Reserva atómica del lote de reintentos (skip locked del lado de PG). */
    async claimRetryableEmails({ limit = 50 } = {}) {
      return assertResult(
        await client.rpc('claim_retryable_emails', { p_limit: limit }),
        'No se pudieron reclamar emails pendientes.',
      )
    },

    /** Entrada del webhook de Brevo: entrega, rebote, spam, desuscripción. */
    async recordDeliveryEvent({ messageId, event, email, reason = null }) {
      assertResult(
        await client.rpc('record_email_delivery_event', {
          p_message_id: messageId,
          p_event: event,
          p_email: email,
          p_reason: reason,
        }),
        'No se pudo registrar el evento de entrega.',
      )
    },

    /** Listado para el panel admin. */
    async listEmailLogs({ status, type, email, limit = 50, offset = 0 } = {}) {
      let query = client
        .from('transactional_email_logs')
        .select(
          'id, template_key, category, recipient_email, status, entity_type, entity_id, error, error_code, attempts_count, next_retry_at, sent_at, delivered_at, bounced_at, created_at',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + Math.min(limit, 200) - 1)

      if (status) query = query.eq('status', status)
      if (type) query = query.eq('template_key', type)
      if (email) query = query.eq('recipient_email', String(email).trim().toLowerCase())

      const result = await query
      return {
        rows: assertResult(result, 'No se pudieron listar los emails.'),
        total: result.count ?? 0,
      }
    },

    // Tres hitos útiles: anticipación, recordatorio y vencimiento. Antes se
    // sumaban día 1 y "expired" al día siguiente, generando hasta cinco mails.
    async claimRenewals({ offsets = DEFAULT_MEMBERSHIP_RENEWAL_OFFSETS, limit = 100 } = {}) {
      return assertResult(
        await client.rpc('claim_membership_renewal_notifications', {
          p_offsets: offsets,
          p_limit: limit,
        }),
        'No se pudieron reclamar renovaciones.',
      )
    },

    async completeRenewal(id, { sent, error = null }) {
      assertResult(
        await client.rpc('complete_membership_renewal_notification', {
          p_notification_id: id,
          p_sent: sent,
          p_error: error,
        }),
        'No se pudo finalizar la renovación.',
      )
    },

    /** Cola de recordatorio/vencimiento de órdenes de pago manual (5 días). */
    async claimOrderExpiryNotifications({ limit = 100 } = {}) {
      return assertResult(
        await client.rpc('claim_payment_order_expiry_notifications', { p_limit: limit }),
        'No se pudieron reclamar los avisos de vencimiento de pago.',
      )
    },

    async completeOrderExpiryNotification(id, { sent, error = null }) {
      assertResult(
        await client.rpc('complete_payment_order_expiry_notification', {
          p_notification_id: id,
          p_sent: sent,
          p_error: error,
        }),
        'No se pudo finalizar el aviso de vencimiento de pago.',
      )
    },
  }
}
