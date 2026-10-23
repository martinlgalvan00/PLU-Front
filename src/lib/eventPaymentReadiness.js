/**
 * Estado de configuración de los medios de cobro de un evento — PLU ARG
 *
 * Responde, antes de guardar, lo que el servidor recién avisa al publicar: qué
 * medios va a ver quien paga y si cada uno tiene a dónde acreditar. Es la misma
 * regla que `checkEventBankTransferReady` / `checkEventCashPaymentReady` del
 * backend, pero evaluada sobre el borrador: el servidor sigue siendo la
 * autoridad, esto solo evita descubrir el faltante después de guardar.
 *
 * Puro: sin i18n ni DOM. Devuelve claves (`detail.key`) para que el panel las
 * traduzca.
 */

import {
  EVENT_PAYMENT_CHANNELS,
  EVENT_PAYMENT_CONCEPTS,
  resolveEventChannelState,
} from './eventPaymentChannels.js'
import { platformCellsFor } from './platformPaymentChannels.js'
import { mercadoPagoAccountStatus } from '../components/admin/payment-accounts/paymentAccountText.js'

function text(value) {
  return String(value ?? '').trim()
}

function offeredAnywhere(overrides, platform, channel) {
  return EVENT_PAYMENT_CONCEPTS.some((concept) =>
    resolveEventChannelState(overrides, concept, channel, platformCellsFor(platform, concept)[channel]),
  )
}

function mercadoPagoRow({ profileId, profile, profilesLoading }) {
  if (!text(profileId)) return { state: 'ready', detail: { key: 'paymentReadinessMpPlatform' } }
  if (!profile) {
    return profilesLoading
      ? { state: 'loading', detail: { key: 'paymentReadinessLoading' } }
      : { state: 'missing', detail: { key: 'paymentReadinessMpMissing' } }
  }
  if (mercadoPagoAccountStatus(profile) === 'needs_reconnect') {
    return { state: 'warning', detail: { key: 'paymentReadinessMpReconnect' } }
  }
  return {
    state: 'ready',
    detail: { key: 'paymentReadinessMpProfile', params: { name: profile.name ?? '' } },
  }
}

function bankRow({ bankAlias, fallbackBankAlias }) {
  const alias = text(bankAlias) || text(fallbackBankAlias)
  return alias
    ? { state: 'ready', detail: { key: 'paymentReadinessTransferReady', params: { alias } } }
    : { state: 'missing', detail: { key: 'paymentReadinessTransferMissing' } }
}

function cashRow({ ownCashPlace, venueLabel }) {
  // Mismo criterio que `resolveCashPaymentDetails`: el lugar propio manda y,
  // vacío, se cobra en la sede del evento.
  const place = text(ownCashPlace) || text(venueLabel)
  return place
    ? { state: 'ready', detail: { key: 'paymentReadinessCashReady', params: { place } } }
    : { state: 'missing', detail: { key: 'paymentReadinessCashMissing' } }
}

/**
 * @returns {{
 *   loading: boolean,
 *   offeredCount: number,
 *   hasBlockers: boolean,
 *   rows: Array<{ channel: string, offered: boolean, state: 'ready'|'missing'|'warning'|'loading'|'off', detail: { key: string, params?: object } }>
 * }}
 */
export function buildPaymentReadiness({
  overrides = null,
  platform = null,
  platformStatus = 'ready',
  venueLabel = '',
  ownCashPlace = '',
  bankAlias = '',
  fallbackBankAlias = '',
  mercadoPagoProfileId = '',
  mercadoPagoProfile = null,
  profilesLoading = false,
} = {}) {
  const rows = EVENT_PAYMENT_CHANNELS.map((channel) => {
    const offered = offeredAnywhere(overrides, platform, channel)
    if (!offered) {
      return { channel, offered, state: 'off', detail: { key: 'paymentReadinessOff' } }
    }
    let row
    if (channel === 'mercado_pago') {
      row = mercadoPagoRow({
        profileId: mercadoPagoProfileId,
        profile: mercadoPagoProfile,
        profilesLoading,
      })
    } else if (channel === 'bank_transfer') {
      row = bankRow({ bankAlias, fallbackBankAlias })
    } else if (channel === 'cash_pitbull') {
      row = cashRow({ ownCashPlace, venueLabel })
    } else {
      row = { state: 'ready', detail: { key: 'paymentReadinessWise' } }
    }
    return { channel, offered, ...row }
  })

  return {
    loading: platformStatus === 'loading',
    offeredCount: rows.filter((row) => row.offered).length,
    hasBlockers: rows.some((row) => row.offered && row.state === 'missing'),
    rows,
  }
}
