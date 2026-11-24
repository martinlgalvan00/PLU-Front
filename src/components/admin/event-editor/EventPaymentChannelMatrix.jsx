import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle } from 'lucide-react'
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

const STATE_ICON = {
  ready: CheckCircle2,
  warning: AlertTriangle,
  missing: AlertTriangle,
  loading: CircleDashed,
  off: MinusCircle,
}

/** Medios con datos propios en el evento (cuenta, alias, lugar): llevan "Configurar". */
const CONFIGURABLE = new Set(['mercado_pago', 'bank_transfer', 'cash_pitbull'])

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
  // Cuenta por evento: puede CERRAR un medio, pero no abrir uno que la plataforma tiene
  // cerrado (saltearía la política de canales manuales). El servidor lo rechaza igual.
  restrictOpen = false,
  /**
   * Estado de cada medio (`buildPaymentReadiness`). Con él, cada fila dice si el
   * medio está listo y qué falta, en el mismo lugar donde se abre o se cierra:
   * antes era una lista aparte debajo de la tabla.
   */
  readiness = null,
  /** Lleva al bloque de configuración del medio (cuenta, alias, lugar). */
  onConfigure = null,
}) {
  const { t, locale } = useI18n()
  const loading = platformStatus === 'loading'
  const channelLabel = (channel) => t(`admin.eventEditor.${CHANNEL_LABEL_KEY[channel]}`)
  const conceptLabel = (concept) => t(`admin.eventEditor.paymentChannelConcept.${concept}`)
  const readinessOf = (channel) => readiness?.rows?.find((row) => row.channel === channel) ?? null
  const pending = readiness
    ? readiness.rows.filter((row) => row.offered && ['missing', 'warning'].includes(row.state))
        .length
    : 0

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
      {readiness && !readiness.loading ? (
        <p
          className="admin-event-form__channel-summary"
          role="status"
          data-pending={pending > 0 || undefined}
        >
          {/* Por nombre: "Acepta Mercado Pago, Transferencia y Efectivo" se
              lee de un vistazo; "3 medios ofrecidos" obligaba a recorrer la tabla. */}
          {readiness.offeredCount > 0
            ? t('admin.eventEditor.paymentChannelAccepts', {
                list: new Intl.ListFormat(locale === 'en' ? 'en' : 'es', {
                  type: 'conjunction',
                }).format(
                  readiness.rows.filter((row) => row.offered).map((row) => channelLabel(row.channel)),
                ),
              })
            : t('admin.eventEditor.paymentChannelSummary', { count: 0 })}
          {pending > 0
            ? ` · ${t(
                pending === 1
                  ? 'admin.eventEditor.paymentChannelPending_one'
                  : 'admin.eventEditor.paymentChannelPending',
                { count: pending },
              )}`
            : ''}
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
        const state = readinessOf(channel)
        const StateIcon = state ? (STATE_ICON[state.state] ?? CircleDashed) : null
        const configurable = Boolean(onConfigure) && state?.offered && CONFIGURABLE.has(channel)
        return (
          <div className="admin-event-form__channel-row" key={channel} data-state={state?.state}>
            <span className="admin-event-form__channel-name">
              {channelLabel(channel)}
              {state && !readiness.loading ? (
                <small className="admin-event-form__channel-state" data-state={state.state}>
                  <StateIcon aria-hidden size={13} />
                  <span>{t(`admin.eventEditor.${state.detail.key}`, state.detail.params)}</span>
                  {configurable ? (
                    <button
                      type="button"
                      className="admin-event-form__channel-configure"
                      onClick={() => onConfigure(channel)}
                    >
                      {t('admin.eventEditor.paymentChannelConfigure')}
                    </button>
                  ) : null}
                </small>
              ) : null}
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
            {EVENT_PAYMENT_CONCEPTS.map((concept) => {
              const platformCell = platformCellOf(platform, concept, channel)
              const checked = resolveEventChannelState(value, concept, channel, platformCell)
              const lockedByPlatform = restrictOpen && !checked && platformCell !== true
              return (
                <label className="admin-event-form__channel-cell" key={concept}>
                  <input
                    checked={checked}
                    type="checkbox"
                    aria-label={`${channelLabel(channel)} · ${conceptLabel(concept)}`}
                    aria-describedby={hasNote ? noteId : undefined}
                    title={
                      lockedByPlatform
                        ? t('admin.eventEditor.paymentChannelClosedByPlatform')
                        : undefined
                    }
                    onChange={(changeEvent) =>
                      patchCell(concept, channel, changeEvent.target.checked)
                    }
                    disabled={!canEdit || loading || lockedByPlatform}
                  />
                  <span>{conceptLabel(concept)}</span>
                </label>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
