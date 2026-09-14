import { Banknote, CreditCard, Coins, Globe2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { openEventChannelsFor } from '../../lib/eventPaymentChannels.js'
import {
  TICKET_TYPE_PAYMENT_CHANNELS,
  allOpenTicketTypePaymentChannels,
  isTicketTypeChannelOpen,
} from '../../lib/ticketTypePaymentChannels.js'

/** Etiqueta y ícono de cada medio, en el orden canónico de la matriz. */
const CHANNEL_META = {
  mercado_pago: { icon: CreditCard, labelKey: 'paymentChannelMercadoPago' },
  bank_transfer: { icon: Banknote, labelKey: 'paymentChannelBankTransfer' },
  cash_pitbull: { icon: Coins, labelKey: 'paymentChannelCashPitbull' },
  wise_transfer: { icon: Globe2, labelKey: 'paymentChannelWise' },
}

/**
 * Medios de cobro de UN tipo de entrada — PLU ARG
 *
 * El caso normal hereda el evento: las entradas se cobran con lo que Cobro
 * dejó abierto. El picker por canal sólo aparece si esta entrada restringe
 * (un palco sólo Mercado Pago, la general sigue con transferencia).
 *
 * Tercer eslabón de la cadena Finanzas → evento → tipo: acá sólo se puede
 * cerrar lo que el evento dejó abierto. Un medio que el evento cerró se
 * muestra apagado y explicado, no desaparece.
 *
 * "Los mismos que el evento" (`value == null`) no es lo mismo que marcarlos
 * todos: si mañana el evento abre Wise, la entrada que hereda lo toma sola y
 * la que eligió explícitamente sus medios no.
 */
export default function AdminTicketTypeChannels({
  canEdit = false,
  error = '',
  eventOverrides = null,
  fieldName,
  value = null,
  onChange,
}) {
  const { t } = useI18n()
  const eventOpen = new Set(openEventChannelsFor(eventOverrides, 'ticket'))
  const custom = value != null

  function toggleChannel(channel, enabled) {
    const current = value ?? allOpenTicketTypePaymentChannels(eventOverrides)
    onChange({ ...current, [channel]: enabled })
  }

  return (
    <fieldset
      className={`admin-ticket-channels${custom ? ' is-custom' : ' is-inherit'}`}
      data-field={fieldName}
    >
      <legend className="admin-ticket-channels__legend">
        {t('admin.eventEditor.supabase.ticketTypeChannelsLabel')}
      </legend>

      {custom ? (
        <>
          <div className="admin-ticket-channels__custom-bar">
            <p className="admin-ticket-channels__summary">
              {t('admin.eventEditor.supabase.ticketTypeChannelsCustomLead')}
            </p>
            {canEdit ? (
              <button
                className="admin-ticket-channels__action"
                type="button"
                onClick={() => onChange(null)}
              >
                {t('admin.eventEditor.supabase.ticketTypeChannelsUseEvent')}
              </button>
            ) : null}
          </div>

          <div className="admin-ticket-channels__list">
            {TICKET_TYPE_PAYMENT_CHANNELS.map((channel) => {
              const meta = CHANNEL_META[channel]
              const Icon = meta.icon
              const closedByEvent = !eventOpen.has(channel)
              const checked = closedByEvent
                ? false
                : isTicketTypeChannelOpen(value, channel)
              return (
                <label
                  key={channel}
                  className={`admin-ticket-channels__item${closedByEvent ? ' is-locked' : ''}`}
                >
                  <input
                    checked={checked}
                    disabled={!canEdit || closedByEvent}
                    type="checkbox"
                    onChange={(event) => toggleChannel(channel, event.target.checked)}
                  />
                  <Icon aria-hidden size={14} />
                  <span className="admin-ticket-channels__name">
                    {t(`admin.eventEditor.${meta.labelKey}`)}
                  </span>
                  {closedByEvent ? (
                    <small className="admin-ticket-channels__locked">
                      {t('admin.eventEditor.supabase.ticketTypeChannelsEventClosed')}
                    </small>
                  ) : null}
                </label>
              )
            })}
          </div>

          <small className="admin-ticket-channels__hint">
            {t('admin.eventEditor.supabase.ticketTypeChannelsHint')}
          </small>
        </>
      ) : (
        <div className="admin-ticket-channels__inherit">
          <p className="admin-ticket-channels__summary">
            {t('admin.eventEditor.supabase.ticketTypeChannelsInheritSummary')}
          </p>
          {canEdit ? (
            <button
              className="admin-ticket-channels__action"
              type="button"
              onClick={() => onChange(allOpenTicketTypePaymentChannels(eventOverrides))}
            >
              {t('admin.eventEditor.supabase.ticketTypeChannelsRestrict')}
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <small className="admin-event-form__error" role="alert">
          {error}
        </small>
      ) : null}
    </fieldset>
  )
}
