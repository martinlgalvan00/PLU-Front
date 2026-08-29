import { HttpError } from '../../lib/errors.js'
import {
  assertPaymentChannelEnabled,
  MANUAL_PAYMENT_CHANNELS,
  PAYMENT_CHANNELS,
} from '../../services/platformFeatureToggleService.js'

const CHANNEL_LABEL = {
  mercado_pago: 'Mercado Pago',
  bank_transfer: 'transferencia',
  cash_pitbull: 'efectivo en Pitbull',
  wise_transfer: 'Wise',
}

const CHANNEL_CODE = {
  mercado_pago: 'MERCADO_PAGO',
  bank_transfer: 'BANK_TRANSFER',
  cash_pitbull: 'CASH_PITBULL',
  wise_transfer: 'WISE_TRANSFER',
}

const CONCEPT_LABEL = {
  membership: 'afiliaciones',
  registration: 'inscripciones',
  ticket: 'entradas',
}

/**
 * Normaliza el override de canales guardado en `events.payment_channel_overrides`
 * o mandado por el editor. `null` = heredar plataforma. Solo se conservan
 * booleanos conocidos; el resto se ignora.
 */
export function normalizePaymentChannelOverrides(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  let any = false
  for (const channel of PAYMENT_CHANNELS) {
    if (typeof raw[channel] === 'boolean') {
      out[channel] = raw[channel]
      any = true
    }
  }
  return any ? out : null
}

/**
 * ¿El canal queda abierto para este evento?
 * `plataforma AND (override[canal] ?? true)` — el evento solo puede cerrar.
 */
export function isEventChannelOpen(platformOpen, overrides, channel) {
  if (!platformOpen) return false
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return true
  return normalized[channel] !== false
}

/**
 * Aplica el override del evento sobre availability pública (registration + ticket).
 * Membership no se toca: sigue 100% plataforma.
 */
export function applyEventPaymentChannelOverrides(availability, overrides) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized || !availability?.paymentChannels) return availability

  const paymentChannels = { ...availability.paymentChannels }
  for (const concept of ['registration', 'ticket']) {
    const base = paymentChannels[concept] ?? {}
    paymentChannels[concept] = Object.fromEntries(
      PAYMENT_CHANNELS.map((channel) => [
        channel,
        Boolean(base[channel]) && normalized[channel] !== false,
      ]),
    )
  }

  const manual = (concept) =>
    MANUAL_PAYMENT_CHANNELS.some((channel) => paymentChannels[concept]?.[channel])

  return {
    ...availability,
    paymentChannels,
    registrationManualEnabled: manual('registration'),
    ticketManualEnabled: manual('ticket'),
  }
}

function trimText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function normalizeBankTransferInput(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { alias: '', cbu: '', holder: '' }
  }
  return {
    alias: trimText(raw.alias).slice(0, 120),
    cbu: trimText(raw.cbu).slice(0, 30),
    holder: trimText(raw.holder).slice(0, 160),
  }
}

/**
 * Alias/CBU/titular resueltos para mostrar en checkout.
 * Prioridad: perfil vinculado > columnas del evento (Fase A) > env global.
 */
export function resolveBankTransferDetails(eventRow = null, env = process.env, profile = null) {
  const globalAlias = trimText(env.VITE_PAYMENT_TRANSFER_ALIAS ?? env.PAYMENT_TRANSFER_ALIAS)
  const globalCbu = trimText(env.VITE_PAYMENT_TRANSFER_CBU ?? env.PAYMENT_TRANSFER_CBU)
  const globalHolder = trimText(env.VITE_PAYMENT_TRANSFER_HOLDER ?? env.PAYMENT_TRANSFER_HOLDER)

  const profileConfig =
    profile?.config ??
    eventRow?.bankTransferProfile?.config ??
    eventRow?.payment_profile?.config ??
    null

  return {
    alias:
      trimText(profileConfig?.alias) ||
      trimText(eventRow?.bank_transfer_alias ?? eventRow?.bankTransferAlias) ||
      globalAlias,
    cbu:
      trimText(profileConfig?.cbu) ||
      trimText(eventRow?.bank_transfer_cbu ?? eventRow?.bankTransferCbu) ||
      globalCbu,
    holder:
      trimText(profileConfig?.holder) ||
      trimText(eventRow?.bank_transfer_holder ?? eventRow?.bankTransferHolder) ||
      globalHolder,
  }
}

/**
 * Si el perfil personaliza canales y deja transferencia abierta, tiene que
 * haber un alias (perfil, evento o env). Evita publicar un evento que ofrezca
 * transferencia sin destino de cobro.
 */
export function assertEventBankTransferReady({
  overrides,
  bankTransfer,
  bankTransferProfileId = null,
  profile = null,
  env = process.env,
} = {}) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return
  if (normalized.bank_transfer === false) return

  const details = resolveBankTransferDetails(
    {
      bank_transfer_alias: bankTransfer?.alias,
      bank_transfer_cbu: bankTransfer?.cbu,
      bank_transfer_holder: bankTransfer?.holder,
      bank_transfer_profile_id: bankTransferProfileId,
    },
    env,
    profile,
  )
  if (!details.alias) {
    throw new HttpError(
      400,
      'Este evento deja abierta la transferencia pero no hay alias configurado (ni perfil, ni evento, ni entorno).',
      { code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED' },
    )
  }
}

/**
 * Payload canónico para guardar / devolver en API admin y requirements.
 */
export function mapEventPaymentProfile(row) {
  if (!row) {
    return {
      paymentChannelOverrides: null,
      bankTransfer: { alias: '', cbu: '', holder: '' },
      bankTransferProfileId: null,
    }
  }
  return {
    paymentChannelOverrides: normalizePaymentChannelOverrides(row.payment_channel_overrides),
    bankTransfer: {
      alias: trimText(row.bank_transfer_alias),
      cbu: trimText(row.bank_transfer_cbu),
      holder: trimText(row.bank_transfer_holder),
    },
    bankTransferProfileId: row.bank_transfer_profile_id ?? null,
  }
}

/**
 * Assert de plataforma + restricción del evento (registration/ticket).
 * Los cupones manuales (`override`) siguen saltando solo canales manuales a
 * nivel plataforma; un evento que cerró el canal no se reabre con cupón.
 */
export function assertEventPaymentChannelEnabled(
  toggles,
  concept,
  channel,
  { override = false, eventOverrides = null } = {},
) {
  assertPaymentChannelEnabled(toggles, concept, channel, { override })

  if (concept !== 'registration' && concept !== 'ticket') return

  const normalized = normalizePaymentChannelOverrides(eventOverrides)
  if (!normalized) return

  const remaining = PAYMENT_CHANNELS.filter((item) => normalized[item] !== false)
  if (remaining.length === 0) {
    const upper = concept.toUpperCase()
    throw new HttpError(
      409,
      `No hay medios de pago disponibles para ${CONCEPT_LABEL[concept]} en este evento.`,
      { code: `${upper}_NO_PAYMENT_CHANNEL` },
    )
  }

  if (normalized[channel] === false) {
    const upper = concept.toUpperCase()
    const openLabels = remaining.map((item) => CHANNEL_LABEL[item])
    const head = `El pago con ${CHANNEL_LABEL[channel]} no está habilitado para este evento.`
    throw new HttpError(
      409,
      openLabels.length ? `${head} Podés pagar con ${openLabels.join(' o ')}.` : head,
      { code: `${upper}_${CHANNEL_CODE[channel]}_DISABLED` },
    )
  }
}
