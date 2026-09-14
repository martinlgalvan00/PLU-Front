import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleSlash, Loader2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { resolveTicketSalesState } from '../../lib/ticketSalesState.js'
import { fetchPlatformFeatureToggles } from '../../services/platformSettingsAdminService.js'

/**
 * Estado efectivo de la venta de entradas del evento, con el motivo cuando
 * está cerrada.
 *
 * El switch de acá arriba es sólo uno de seis controles (ver
 * `src/lib/ticketSalesState.js`). Prenderlo y que no pase nada era el modo
 * normal de operar: esta tira dice cuál de los otros cinco está cortando y
 * dónde se toca, sin obligar a recorrer Finanzas, la consola y el catálogo.
 *
 * Los interruptores de plataforma se leen acá y no bajan por props: el editor
 * ya resuelve sus propias lecturas auxiliares (perfiles de cobro) del mismo
 * modo, y encadenar una prop más por cinco capas para un cartel informativo
 * costaría más de lo que aporta. Si la lectura falla, se muestra lo que
 * depende del evento y el catálogo en vez de no mostrar nada.
 */
export default function AdminTicketSalesStatus({ draft, onGoToChapter = null }) {
  const { t } = useI18n()
  const [platform, setPlatform] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchPlatformFeatureToggles()
      .then((toggles) => {
        if (alive) setPlatform(toggles)
      })
      .catch(() => {
        // Sin plataforma se evalúa igual: el editor puede arreglar lo suyo.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const state = useMemo(
    () => resolveTicketSalesState({ event: draft, platform }),
    [draft, platform],
  )

  const channels = state.openChannels
    .map((channel) => t(`admin.eventEditor.paymentChannel${CHANNEL_KEY[channel]}`))
    .join(' · ')

  return (
    <section
      className={`admin-ticket-sales-status admin-ticket-sales-status--${state.open ? 'open' : 'closed'}`}
      aria-live="polite"
    >
      <p className="admin-ticket-sales-status__head">
        {loading ? (
          <Loader2 className="admin-ticket-sales-status__spinner" size={14} aria-hidden />
        ) : state.open ? (
          <CheckCircle2 size={14} aria-hidden />
        ) : (
          <CircleSlash size={14} aria-hidden />
        )}
        <strong>
          {state.open
            ? t('admin.eventEditor.ticketSalesState.open')
            : t('admin.eventEditor.ticketSalesState.closed')}
        </strong>
      </p>

      {state.open ? (
        <p className="admin-ticket-sales-status__detail">
          {t('admin.eventEditor.ticketSalesState.openDetail', {
            types: state.typesInWindow,
            channels: channels || t('admin.eventEditor.ticketSalesState.noChannelsShort'),
          })}
        </p>
      ) : (
        <ul className="admin-ticket-sales-status__blockers">
          {state.blockers.map((blocker) => {
            const chapter = CHAPTER_BY_BLOCKER[blocker.code]
            return (
              <li key={blocker.code} data-scope={blocker.scope}>
                <span className="admin-ticket-sales-status__scope">
                  {t(`admin.eventEditor.ticketSalesState.scope.${blocker.scope}`)}
                </span>
                <span className="admin-ticket-sales-status__reason">
                  {t(`admin.eventEditor.ticketSalesState.blocker.${blocker.code}`, {
                    detail: blocker.detail ?? '',
                  })}
                </span>
                {chapter && onGoToChapter ? (
                  <button
                    className="admin-ticket-sales-status__go"
                    type="button"
                    onClick={() => onGoToChapter(chapter)}
                  >
                    {t('admin.eventEditor.ticketSalesState.goTo')}
                    <ArrowRight aria-hidden size={12} />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * A qué capítulo de Ventas y cupos lleva cada bloqueo. Sólo los que se
 * arreglan acá: entorno y plataforma se tocan en Finanzas y las jornadas en
 * Estructura, así que ésos siguen diciendo el motivo sin ofrecer un atajo que
 * no llevaría a ninguna parte.
 */
const CHAPTER_BY_BLOCKER = {
  eventDisabled: 'tickets',
  windowUpcoming: 'tickets',
  windowClosed: 'tickets',
  noSellableType: 'tickets',
  noTypeInWindow: 'tickets',
  noTypeWithChannel: 'tickets',
  noChannel: 'payment',
}

const CHANNEL_KEY = {
  mercado_pago: 'MercadoPago',
  bank_transfer: 'BankTransfer',
  cash_pitbull: 'CashPitbull',
  wise_transfer: 'Wise',
}
