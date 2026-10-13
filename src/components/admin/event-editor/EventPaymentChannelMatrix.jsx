import { useI18n } from '../../../i18n/I18nProvider.jsx'
import {
  EVENT_CHANNEL_OPEN,
  EVENT_PAYMENT_CHANNELS,
  EVENT_PAYMENT_CONCEPTS,
  eventChannelFlagFor,
  eventChannelOverridesFor,
  resolveEventChannelState,
  setEventChannelFlag,
} from '../../../lib/eventPaymentChannels.js'
import { platformCellsFor } from '../../../lib/platformPaymentChannels.js'

const CHANNEL_LABEL_KEY = {
  mercado_pago: 'paymentChannelMercadoPago',
  bank_transfer: 'paymentChannelBankTransfer',
  cash_pitbull: 'paymentChannelCashPitbull',
  wise_transfer: 'paymentChannelWise',
}

/**
 * Celda cruda de la plataforma. Si todavía no se leyó (o la lectura falló) se
 * asume la política por omisión de Finanzas: así una celda sin tocar se dibuja
 * igual que sería con la lectura, y el único riesgo es no poder abrir un canal
 * hasta que la lectura llegue — por eso el control se bloquea mientras carga.
 */
function platformCellOf(platform, concept, channel) {
  return platformCellsFor(platform, concept)[channel]
}

/**
 * Medios de pago de un evento: una fila por medio, una columna por concepto
 * (inscripción / entradas).
 *
 * La plataforma es el valor por defecto y cada celda del evento puede cerrar o
 * abrir. Sólo se guarda lo que *difiere* de la plataforma (ver
 * `eventChannelFlagFor`): una celda que coincide queda sin clave y sigue lo que
 * Finanzas cambie después.
 */
export default function EventPaymentChannelMatrix({
  value,
  onChange,
  platform = null,
  platformStatus = 'ready',
  canEdit = true,
  ticketError = '',
  idPrefix = 'event',
  showLead = true,
}) {
  const { t } = useI18n()
  const loading = platformStatus === 'loading'
  const channelLabel = (channel) => t(`admin.eventEditor.${CHANNEL_LABEL_KEY[channel]}`)
  const conceptLabel = (concept) => t(`admin.eventEditor.paymentChannelConcept.${concept}`)

  function patchCell(concept, channel, want) {
    const flag = eventChannelFlagFor(want, platformCellOf(platform, concept, channel))
    onChange(setEventChannelFlag(value, concept, channel, flag))
  }

  /** Qué conceptos se apartan de la plataforma en este medio, para la nota. */
  function divergence(channel) {
    const opened = []
    const closed = []
    for (const concept of EVENT_PAYMENT_CONCEPTS) {
      const flag = eventChannelOverridesFor(value, concept)?.[channel]
      if (flag === EVENT_CHANNEL_OPEN && !platformCellOf(platform, concept, channel)) {
        opened.push(concept)
      }
      if (flag === false && platformCellOf(platform, concept, channel)) closed.push(concept)
    }
    return { opened, closed }
  }

  return (
    <div
      className="admin-event-form__channel-grid admin-event-form__channel-matrix"
      role="group"
      aria-label={t('admin.eventEditor.paymentChannelMatrixLabel')}
      aria-busy={loading || undefined}
    >
      {showLead ? (
        <p className="admin-event-form__channel-lead">
          {t('admin.eventEditor.paymentChannelMatrixHint')}
        </p>
      ) : null}
      {platformStatus === 'error' ? (
        <p className="admin-event-form__notice" role="status">
          {t('admin.eventEditor.paymentChannelPlatformUnknown')}
        </p>
      ) : null}
      {/* Cerrar los cuatro es cerrar la venta por un camino que no se ve en
          ningún otro lado. */}
      {ticketError ? (
        <p
          className="admin-event-form__alert"
          role="alert"
          data-field="paymentChannelOverrides.ticket"
          tabIndex={-1}
        >
          {ticketError}
        </p>
      ) : null}
      <div className="admin-event-form__channel-head" aria-hidden="true">
        <span />
        {EVENT_PAYMENT_CONCEPTS.map((concept) => (
          <span key={concept}>{conceptLabel(concept)}</span>
        ))}
      </div>
      {EVENT_PAYMENT_CHANNELS.map((channel) => {
        const { opened, closed } = divergence(channel)
        const noteId = `${idPrefix}-channel-note-${channel}`
        const hasNote = opened.length > 0 || closed.length > 0
        return (
          <div className="admin-event-form__channel-row" key={channel}>
            <span className="admin-event-form__channel-name">
              {channelLabel(channel)}
              {hasNote ? (
                <small className="admin-event-form__channel-note" id={noteId}>
                  {opened.length > 0
                    ? t('admin.eventEditor.paymentChannelOpenedHere', {
                        concepts: opened.map(conceptLabel).join(' · '),
                      })
                    : null}
                  {opened.length > 0 && closed.length > 0 ? ' ' : null}
                  {closed.length > 0
                    ? t('admin.eventEditor.paymentChannelClosedHere', {
                        concepts: closed.map(conceptLabel).join(' · '),
                      })
                    : null}
                </small>
              ) : null}
            </span>
            {EVENT_PAYMENT_CONCEPTS.map((concept) => (
              <label className="admin-event-form__channel-cell" key={concept}>
                <input
                  checked={resolveEventChannelState(
                    value,
                    concept,
                    channel,
                    platformCellOf(platform, concept, channel),
                  )}
                  type="checkbox"
                  aria-label={`${channelLabel(channel)} · ${conceptLabel(concept)}`}
                  aria-describedby={hasNote ? noteId : undefined}
                  onChange={(changeEvent) => patchCell(concept, channel, changeEvent.target.checked)}
                  disabled={!canEdit || loading}
                />
                <span>{conceptLabel(concept)}</span>
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}
