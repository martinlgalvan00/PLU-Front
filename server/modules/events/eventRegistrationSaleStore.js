import { HttpError } from '../../lib/errors.js'
import {
  assertSupabaseResult,
  isMissingRelation,
  isMissingSchemaColumn,
} from '../../lib/supabaseRpc.js'
import {
  bankTransferIssueError,
  cashPaymentIssueError,
  checkEventBankTransferReady,
  checkEventCashPaymentReady,
} from '../payments/eventPaymentProfile.js'
import { createSupabasePaymentProfileRepository } from '../payments/supabasePaymentProfileRepository.js'

/**
 * Venta de inscripciones desde el panel (control de venta / acciones rápidas).
 *
 * Dos cosas que el PATCH de estado (`POST /api/events/:slug/state`) no hacía:
 *
 * 1. Escribir la ventana de inscripción. "Programar apertura" y "Abrir ahora"
 *    necesitan mover `registration_opens_at` / `registration_closes_at` sin
 *    pasar por el upsert completo (que reescribe días y tipos de entrada).
 * 2. Rechazar la publicación con el cobro a medio configurar, igual que el
 *    guardado del editor. Antes "Publicar" desde la barra rápida se salteaba
 *    esa validación y podía dejar a un comprador frente a una transferencia
 *    sin alias.
 */

/** Fecha ISO o `null` (borra). `undefined` = no se toca. */
function normalizeWindowValue(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Fecha y hora inválidas.')
  return date.toISOString()
}

/**
 * Ventana guardada hoy, en la forma que acepta `saveRegistrationWindow`: es lo
 * que se repone si el cambio de estado que sigue falla.
 */
export async function readRegistrationWindow(client, slug) {
  const row = assertSupabaseResult(
    await client
      .from('events')
      .select('registration_opens_at, registration_closes_at')
      .eq('slug', slug)
      .maybeSingle(),
    'No se pudo leer el evento.',
  )
  if (!row) throw new HttpError(404, 'Evento no encontrado.')
  return {
    registrationOpensAt: row.registration_opens_at ?? null,
    registrationClosesAt: row.registration_closes_at ?? null,
  }
}

/**
 * @param {object} client Supabase con service role
 * @param {string} slug
 * @param {{ registrationOpensAt?: string|null, registrationClosesAt?: string|null }} window
 * @param {string} actor `id:email` del staff, para la auditoría
 * @returns {Promise<boolean>} si hubo algo para escribir
 */
export async function saveRegistrationWindow(client, slug, window, actor) {
  const opensAt = normalizeWindowValue(window.registrationOpensAt)
  const closesAt = normalizeWindowValue(window.registrationClosesAt)
  if (opensAt === undefined && closesAt === undefined) return false

  const result = await client.rpc('staff_set_event_registration_window', {
    p_event_slug: slug,
    p_set_opens: opensAt !== undefined,
    p_opens_at: opensAt ?? null,
    p_set_closes: closesAt !== undefined,
    p_closes_at: closesAt ?? null,
    p_actor: actor,
  })
  if (!result.error) return true
  if (!isMissingRelation(result.error)) {
    assertSupabaseResult(result, 'No se pudo cambiar la ventana de inscripción.')
  }

  // Despliegue escalonado: sin la migración 20261230100000 se escribe directo
  // (sin la fila de auditoría), con la misma validación de orden que la RPC.
  const current = assertSupabaseResult(
    await client
      .from('events')
      .select('id, registration_opens_at, registration_closes_at')
      .eq('slug', slug)
      .maybeSingle(),
    'No se pudo leer el evento.',
  )
  if (!current) throw new HttpError(404, 'Evento no encontrado.')
  const nextOpens = opensAt === undefined ? current.registration_opens_at : opensAt
  const nextCloses = closesAt === undefined ? current.registration_closes_at : closesAt
  if (nextOpens && nextCloses && new Date(nextCloses) < new Date(nextOpens)) {
    throw new HttpError(400, 'El cierre de la inscripción tiene que ser posterior a la apertura.')
  }
  const patch = {}
  if (opensAt !== undefined) patch.registration_opens_at = opensAt
  if (closesAt !== undefined) patch.registration_closes_at = closesAt
  assertSupabaseResult(
    await client.from('events').update(patch).eq('id', current.id),
    'No se pudo cambiar la ventana de inscripción.',
  )
  return true
}

/**
 * Lo mismo que exige el upsert del editor con `published: true`: si la
 * transferencia o el efectivo están abiertos para el evento, tienen que tener
 * a dónde cobrar. Tira el mismo 400 (con el campo a completar).
 */
export async function assertEventPaymentsReadyToPublish(client, slug, { env = process.env } = {}) {
  const event = assertSupabaseResult(
    await client
      .from('events')
      .select(
        'id, venue, location, payment_channel_overrides, bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder, bank_transfer_profile_id',
      )
      .eq('slug', slug)
      .maybeSingle(),
    'No se pudo leer el evento.',
  )
  if (!event) throw new HttpError(404, 'Evento no encontrado.')

  const profile = event.bank_transfer_profile_id
    ? await createSupabasePaymentProfileRepository(client, { env }).findById(
        event.bank_transfer_profile_id,
      )
    : null
  const bankIssue = checkEventBankTransferReady({
    overrides: event.payment_channel_overrides,
    bankTransfer: {
      alias: event.bank_transfer_alias,
      cbu: event.bank_transfer_cbu,
      holder: event.bank_transfer_holder,
    },
    bankTransferProfileId: event.bank_transfer_profile_id ?? null,
    profile,
    env,
  })
  if (bankIssue) throw bankTransferIssueError(bankIssue)

  // Columna de una migración posterior: sin ella el efectivo se cobra en la sede.
  const cash = await client
    .from('events')
    .select('cash_payment_place')
    .eq('id', event.id)
    .maybeSingle()
  if (cash.error && !isMissingSchemaColumn(cash.error)) {
    assertSupabaseResult(cash, 'No se pudo leer el evento.')
  }
  const cashIssue = checkEventCashPaymentReady({
    overrides: event.payment_channel_overrides,
    cashPayment: { place: cash.error ? '' : (cash.data?.cash_payment_place ?? '') },
    event: { venue: event.venue, location: event.location },
  })
  if (cashIssue) throw cashPaymentIssueError(cashIssue)
}
