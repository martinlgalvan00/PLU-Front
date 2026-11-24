import { useCallback, useEffect, useMemo, useState } from 'react'
import { QrCode, Ticket } from 'lucide-react'
import CardPreviewModal from '../../components/ui/CardPreviewModal.jsx'
import Pill from '../../components/ui/Pill.jsx'
import TicketDoorQrDialog from './TicketDoorQrDialog.jsx'
import { zoneScopeList } from '../../components/ui/TicketTypeOptions.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ticketAdmissionState } from '../../lib/ticketAdmission.js'
import { fetchMyTickets } from '../../services/ticketApi.js'

const STATE_TONE = {
  ready: 'success',
  upcoming: 'info',
  used: 'neutral',
  expired: 'neutral',
}

const STATE_LABEL_KEY = {
  ready: 'account.tickets.ready',
  upcoming: 'account.tickets.notYet',
  used: 'account.tickets.used',
  expired: 'account.tickets.expired',
}

function formatDate(value, locale, options = { dateStyle: 'medium' }) {
  if (!value) return ''
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', options)
}

/**
 * Un evento ya terminado va a "Anteriores" aunque su entrada no se haya usado:
 * lo que importa en la puerta son las que todavía pueden abrirla.
 */
function isPastEvent(ticket, now) {
  const end = ticket.eventEndsAt ?? ticket.eventDate
  if (!end) return false
  return new Date(end).getTime() < now.getTime()
}

/**
 * "Mis entradas": las entradas acreditadas que le pertenecen a la cuenta (por
 * DNI o por mail de compra verificado), con su QR a un toque. Sólo llegan
 * entradas `pagada`: una pendiente o cancelada no abre la puerta y mostrarla
 * confunde a quien la presenta.
 */
export default function MyTicketsSection({ onNavigate, loadTickets = fetchMyTickets }) {
  const { locale, t } = useI18n()
  const [tickets, setTickets] = useState(null)
  const [error, setError] = useState(null)
  const [activeTicket, setActiveTicket] = useState(null)
  // La card para redes es aparte del QR de puerta: se abre desde él.
  const [shareTicket, setShareTicket] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTickets(await loadTickets())
    } catch (err) {
      setError(err)
      setTickets((current) => current ?? [])
    }
  }, [loadTickets])

  useEffect(() => {
    void load()
  }, [load])

  // Una entrada aprobada mientras la persona tenía la pestaña en segundo plano
  // tiene que aparecer al volver, sin recargar: es justo cuando la abre en la
  // fila de la puerta.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [load])

  const groups = useMemo(() => {
    const now = new Date()
    const upcoming = []
    const past = []
    for (const ticket of tickets ?? []) {
      const entry = { ...ticket, state: ticketAdmissionState(ticket, now) }
      if (isPastEvent(ticket, now)) past.push(entry)
      else upcoming.push(entry)
    }
    past.reverse()
    return { upcoming, past }
  }, [tickets])

  function renderTicket(ticket) {
    const scopes = ticket.credentialScopes ?? []
    const showZones = scopes.some((scope) => scope !== 'gate_tickets')
    const canShowQr =
      !ticket.qrLocked && (ticket.state === 'ready' || ticket.state === 'upcoming')
    const lockedActive =
      ticket.qrLocked && (ticket.state === 'ready' || ticket.state === 'upcoming')
    const tone = STATE_TONE[ticket.state] ?? 'neutral'

    return (
      <article key={ticket.id} className="account-tickets__item">
        <div className="account-tickets__event">
          <strong>{ticket.eventTitle}</strong>
          <span>
            {[formatDate(ticket.eventDate, locale), ticket.eventVenue].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="account-tickets__holder">
          <strong>
            {ticket.credentialLabel || ticket.ticketTypeName}
            {ticket.courtesyLabel || ticket.orderChannel === 'courtesy' ? (
              <em> · {t('account.tickets.guest')}</em>
            ) : null}
          </strong>
          <span>
            {ticket.attendeeName} · <span className="account-tickets__mono">{ticket.ticketCode}</span>
          </span>
          {showZones ? (
            <span>{t('account.tickets.opens', { zones: zoneScopeList(scopes, t) })}</span>
          ) : null}
        </div>
        <div className="account-tickets__state">
          <Pill tone={tone}>{t(STATE_LABEL_KEY[ticket.state] ?? 'account.tickets.ready')}</Pill>
          {lockedActive ? (
            <small className="account-tickets__locked">
              {ticket.buyerEmailMasked
                ? t('account.tickets.qrLocked', { email: ticket.buyerEmailMasked })
                : t('account.tickets.qrLockedNoEmail')}
            </small>
          ) : null}
          {ticket.state === 'used' && ticket.checkedInAt ? (
            <small>
              {t('account.tickets.usedAt', {
                date: formatDate(ticket.checkedInAt, locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })}
            </small>
          ) : null}
        </div>
        {canShowQr ? (
          <button
            type="button"
            className="account-tickets__qr"
            onClick={() => setActiveTicket(ticket)}
          >
            <QrCode size={16} aria-hidden />
            {t('account.tickets.showQr')}
          </button>
        ) : (
          <span className="account-tickets__qr-spacer" aria-hidden />
        )}
      </article>
    )
  }

  return (
    <section id="account-tickets" className="account-section account-section--neutral">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--neutral">
          <Ticket size={21} />
        </div>
        <div>
          <span>{t('account.tickets.eyebrow')}</span>
          <h2>{t('account.tickets.title')}</h2>
        </div>
      </div>
      <p className="account-tickets__lead">{t('account.tickets.lead')}</p>

      {tickets === null ? (
        <p className="account-tickets__status" role="status">
          {t('account.tickets.loading')}
        </p>
      ) : error && tickets.length === 0 ? (
        <div className="account-empty" role="alert">
          <p className="account-empty__title">{t('account.tickets.loadError')}</p>
          <button type="button" className="account-empty__action" onClick={() => void load()}>
            {t('account.tickets.retry')}
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="account-empty">
          <p className="account-empty__title">{t('account.tickets.emptyTitle')}</p>
          <p className="account-empty__lead">{t('account.tickets.emptyLead')}</p>
          <p className="account-empty__lead">{t('account.tickets.verifyEmailHint')}</p>
          {typeof onNavigate === 'function' ? (
            <button
              type="button"
              className="account-empty__action"
              onClick={() => onNavigate('tickets')}
            >
              {t('account.tickets.emptyAction')}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {groups.upcoming.length > 0 ? (
            <div className="account-tickets__group">
              <h3>{t('account.tickets.upcoming')}</h3>
              <div className="account-tickets__list">{groups.upcoming.map(renderTicket)}</div>
            </div>
          ) : null}
          {groups.past.length > 0 ? (
            <div className="account-tickets__group account-tickets__group--past">
              <h3>{t('account.tickets.past')}</h3>
              <div className="account-tickets__list">{groups.past.map(renderTicket)}</div>
            </div>
          ) : null}
        </>
      )}

      {activeTicket ? (
        <TicketDoorQrDialog
          ticket={activeTicket}
          onClose={() => setActiveTicket(null)}
          onShare={() => {
            setShareTicket(activeTicket)
            setActiveTicket(null)
          }}
        />
      ) : null}

      <CardPreviewModal
        open={Boolean(shareTicket)}
        onClose={() => setShareTicket(null)}
        cardData={
          shareTicket
            ? {
                athleteName: shareTicket.attendeeName,
                athleteCode: shareTicket.ticketCode,
                qrCode: shareTicket.qrToken,
                attendeeDocument: shareTicket.attendeeDni,
                eventTitle: shareTicket.eventTitle,
                eventDate: shareTicket.eventDate,
                eventVenue: shareTicket.eventVenue,
                eventLocation: shareTicket.eventLocation,
                eventSlug: shareTicket.eventSlug,
                dayPassLabel: shareTicket.credentialLabel || shareTicket.ticketTypeName || '',
                variant: 'ticket',
              }
            : {}
        }
      />
    </section>
  )
}
