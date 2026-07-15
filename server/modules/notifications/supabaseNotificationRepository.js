import { HttpError } from '../../lib/errors.js'

function assertResult(result, message) {
  if (result.error) throw new HttpError(503, result.error.message || message)
  return result.data
}

export function createSupabaseNotificationRepository(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no está configurado.')

  return {
    async beginEmail(input) {
      const existing = assertResult(
        await client
          .from('transactional_email_logs')
          .select('*')
          .eq('idempotency_key', input.idempotencyKey)
          .maybeSingle(),
        'No se pudo consultar el email.',
      )
      if (existing) return { emailLog: existing, created: false }

      const result = await client
        .from('transactional_email_logs')
        .insert({
          idempotency_key: input.idempotencyKey,
          template_key: input.type,
          template_id: input.templateId ? Number(input.templateId) : null,
          recipient_email: input.to,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          status: 'processing',
          payload: input.params ?? {},
        })
        .select()
        .single()

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

    async completeEmail(id, { status, response = null, error = null }) {
      return assertResult(
        await client
          .from('transactional_email_logs')
          .update({
            status,
            provider_message_id: response?.messageId ?? null,
            provider_response: response,
            error,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single(),
        'No se pudo finalizar el email.',
      )
    },

    async claimRenewals({ offsets = [30, 7, 1, 0], limit = 100 } = {}) {
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
  }
}
