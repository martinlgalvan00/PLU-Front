import '../../styles/components/buyer-tickets-wallet.css'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import TicketPassPreview from './TicketPassPreview.jsx'
import { zoneScopeList } from './TicketTypeOptions.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { speakDoorCode } from '../../lib/doorCodeSpeech.js'
import { formatPromoDeadline } from '../../lib/format.js'
import {
  collectBuyerTicketDayFilters,
  compactAccessDaysLabel,
  describeBuyerTicketDays,
} from '../../lib/buyerTicketDays.js'
import { ticketTypeNameParts } from '../../lib/eventPricing.js'
import { groupCredentialsByBundle } from '../../lib/ticketCredentials.js'
import { formatTicketRevealWhen } from '../../lib/ticketReveal.js'
import { TICKET_VALIDITY_STATUS, ticketValidityStatus } from '../../lib/ticketValidity.js'
import {
  buildCardFilename,
  downloadCard,
  generateEventCard,
  preloadEventCardCapture,
} from '../../services/eventCardService.js'

async function waitForPassImagesReady(node, { timeoutMs = 4000 } = {}) {
  if (!node) return
  const images = [...node.querySelectorAll('img')]
  await Promise.race([
    Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
        })
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

function displayEventDate(ticket, event, locale) {
  const sameEvent =
    event && (event.slug === ticket?.eventSlug || event.id === ticket?.eventSlug)
  const candidates = [sameEvent ? event?.date : '', ticket?.eventDate].filter(Boolean)
  const pretty = candidates.find((value) => !/^\d{4}-\d{2}-\d{2}T/.test(String(value)))
  if (pretty) return pretty
  const iso = candidates[0]
  return iso ? formatPromoDeadline(iso, locale) : ''
}

function kindLabel(ticket, multi) {
  if (multi && ticket.credentialLabel) return ticket.credentialLabel
  return ticket.ticketTypeName || ticket.credentialLabel || ''
}

function validityCopy(status, t) {
  if (status === TICKET_VALIDITY_STATUS.UPCOMING) return t('pages.tickets.wallet.statusUpcoming')
  if (status === TICKET_VALIDITY_STATUS.VALID) return t('pages.tickets.wallet.statusValid')
  if (status === TICKET_VALIDITY_STATUS.EXPIRED) return t('pages.tickets.wallet.statusExpired')
  return ''
}

/**
 * Lista de una compra y un solo pase abierto. No monta un QR por entrada:
 * el código se genera recién cuando esa fila está elegida y el pago está acreditado.
 */
export default function BuyerTicketsWallet({
  anchorId,
  catalogTypes = [],
  event = null,
  orderStatus,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const passRef = useRef(null)
  const [dayKey, setDayKey] = useState('all')
  const [pickedId, setPickedId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const qrReady = orderStatus === 'aprobado'
  const dayOptions = { locale, catalogTypes }

  const described = tickets.map((ticket) => ({
    ticket,
    days: describeBuyerTicketDays(ticket, dayOptions),
  }))
  const filters = collectBuyerTicketDayFilters(tickets, dayOptions)
  const filtersHelp =
    filters.length > 1 &&
    filters.some((filter) =>
      described.some((item) => !item.days.days.some((day) => day.key === filter.key)),
    )

  const visible = described.filter(
    (item) => dayKey === 'all' || item.days.days.some((day) => day.key === dayKey),
  )
  const bundles = groupCredentialsByBundle(visible.map((item) => item.ticket))
  const daysById = new Map(visible.map((item) => [item.ticket.id, item.days]))
  const visibleTickets = bundles.flatMap((bundle) => bundle.credentials)
  const selected = visibleTickets.find((ticket) => ticket.id === pickedId) ?? visibleTickets[0] ?? null
  const selectedDays = selected ? daysById.get(selected.id) : null
  const selectedMulti =
    (bundles.find((bundle) => bundle.credentials.some((item) => item.id === selected?.id))
      ?.credentials.length ?? 0) > 1
  const selectedAccess = selected
    ? ticketTypeNameParts(kindLabel(selected, selectedMulti), locale)
    : { title: '', note: '' }

  const selectedSealed = Boolean(
    selected && qrReady && !selected.qrToken && (selected.passSealed || selected.revealAt),
  )
  const selectedRevealWhen = selectedSealed
    ? formatTicketRevealWhen(selected.revealAt, locale)
    : ''

  const selectedIndex = Math.max(
    0,
    visibleTickets.findIndex((ticket) => ticket.id === selected?.id),
  )

  function showTicketAt(index) {
    const ticket = visibleTickets[index]
    if (ticket) setPickedId(ticket.id)
  }

  useEffect(() => {
    if (qrReady && selected?.qrToken) preloadEventCardCapture().catch(() => {})
  }, [qrReady, selected?.qrToken])

  async function capturePass(ticket) {
    const node = passRef.current
    if (!node || !ticket) return null
    await waitForPassImagesReady(node)
    const blob = await generateEventCard(node)
    const filename = buildCardFilename(
      ticket.attendeeName,
      ticket.eventSlug || event?.slug || 'evento',
      ticket.ticketCode || '',
    )
    return { blob, filename }
  }

  async function handleDownload(ticket) {
    setDownloading(true)
    setDownloadError('')
    try {
      const captured = await capturePass(ticket)
      if (captured) downloadCard(captured.blob, captured.filename)
    } catch (err) {
      console.error('BuyerTicketsWallet: descarga de entrada', err)
      setDownloadError(t('pages.tickets.downloadPassError'))
    } finally {
      setDownloading(false)
    }
  }

  async function handlePrint(ticket) {
    setDownloading(true)
    setDownloadError('')
    try {
      const captured = await capturePass(ticket)
      if (!captured) return
      const url = URL.createObjectURL(captured.blob)
      const frame = window.open('', '_blank')
      if (!frame) {
        downloadCard(captured.blob, captured.filename)
        URL.revokeObjectURL(url)
        return
      }
      frame.opener = null
      frame.document.open()
      frame.document.write(
        '<!doctype html><html><head><title>Entrada</title></head><body style="margin:0"><img alt="" src="' +
          url +
          '" style="max-width:100%;height:auto" onload="window.focus();window.print()"></body></html>',
      )
      frame.document.close()
      frame.addEventListener('afterprint', () => {
        URL.revokeObjectURL(url)
        frame.close()
      })
    } catch (err) {
      console.error('BuyerTicketsWallet: impresión de entrada', err)
      setDownloadError(t('pages.tickets.downloadPassError'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="buyer-tickets-wallet"
      id={anchorId || undefined}
      onKeyDown={(event) => {
        if (!qrReady || visibleTickets.length < 2) return
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        showTicketAt(selectedIndex + (event.key === 'ArrowRight' ? 1 : -1))
      }}
    >
      {filtersHelp ? (
        <div className="buyer-tickets-wallet__filters" role="group" aria-label={t('pages.tickets.wallet.filterAria')}>
          <button
            type="button"
            className="buyer-tickets-wallet__filter"
            aria-pressed={dayKey === 'all'}
            onClick={() => setDayKey('all')}
          >
            {t('pages.tickets.wallet.filterAll')}
          </button>
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="buyer-tickets-wallet__filter"
              aria-pressed={dayKey === filter.key}
              onClick={() => setDayKey(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      {qrReady && visibleTickets.length > 1 ? (
        <div className="buyer-tickets-wallet__nav">
          <button
            type="button"
            className="buyer-tickets-wallet__nav-btn"
            aria-label={t('pages.tickets.wallet.previous')}
            disabled={selectedIndex <= 0}
            onClick={() => showTicketAt(selectedIndex - 1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <p className="buyer-tickets-wallet__count" aria-live="polite">
            {t('pages.tickets.wallet.position', {
              current: selectedIndex + 1,
              total: visibleTickets.length,
            })}
          </p>
          <button
            type="button"
            className="buyer-tickets-wallet__nav-btn"
            aria-label={t('pages.tickets.wallet.next')}
            disabled={selectedIndex >= visibleTickets.length - 1}
            onClick={() => showTicketAt(selectedIndex + 1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      ) : null}

      {bundles.length === 0 ? (
        <p className="buyer-tickets-wallet__empty">{t('pages.tickets.wallet.empty')}</p>
      ) : null}

      {!qrReady && bundles.length > 0 ? (
        <div className="buyer-tickets-wallet__groups">
          {bundles.map((bundle) => {
            const multi = bundle.credentials.length > 1
            const holder = bundle.credentials[0]?.attendeeName ?? ''
            return (
              <section key={bundle.bundleId} className="buyer-tickets-wallet__group">
                {multi ? (
                  <header className="buyer-tickets-wallet__group-head">
                    <h3>{t('pages.tickets.credentialsFor', { name: holder })}</h3>
                    <p>
                      {t('pages.tickets.bundleNote_other', { count: bundle.credentials.length })}
                    </p>
                  </header>
                ) : null}
                <ul className="buyer-tickets-wallet__list">
                  {bundle.credentials.map((ticket) => {
                    const days = daysById.get(ticket.id)
                    const active = selected?.id === ticket.id
                    const typeName = ticketTypeNameParts(kindLabel(ticket, multi), locale)
                    const dayLabel = compactAccessDaysLabel(days, locale)
                    const statusLabel = qrReady
                      ? validityCopy(ticketValidityStatus(ticket), t)
                      : t('pages.tickets.qrHeldTicket')
                    const scopes = ticket.credentialScopes ?? []
                    const showZones =
                      scopes.length > 0 &&
                      (multi || scopes.some((scope) => scope !== 'gate_tickets'))
                    return (
                      <li key={ticket.id}>
                        <button
                          type="button"
                          className={`buyer-tickets-wallet__row${active ? ' is-active' : ''}`}
                          aria-pressed={active}
                          onClick={() => setPickedId(ticket.id)}
                        >
                          <span className="buyer-tickets-wallet__row-main">
                            <strong>{ticket.attendeeName}</strong>
                            {typeName.title ? (
                              <span className="buyer-tickets-wallet__row-type">{typeName.title}</span>
                            ) : null}
                          </span>
                          {dayLabel ? (
                            <span className="buyer-tickets-wallet__row-meta">{dayLabel}</span>
                          ) : null}
                          {statusLabel ? (
                            <span className="buyer-tickets-wallet__row-status">{statusLabel}</span>
                          ) : null}
                          {showZones ? (
                            <span className="buyer-tickets-wallet__row-meta">
                              {t('pages.tickets.credentialOpens', {
                                zones: zoneScopeList(scopes, t),
                              })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      ) : null}

      {selectedSealed ? (
        <div className="buyer-tickets-wallet__pass">
          <div className="buyer-tickets-wallet__sheet">
            {selectedAccess.title ? (
              <p className="buyer-tickets-wallet__access">{selectedAccess.title}</p>
            ) : null}
            {selectedAccess.note ? (
              <p className="buyer-tickets-wallet__note">{selectedAccess.note}</p>
            ) : null}
            <p className="buyer-tickets-wallet__who">
              {t('pages.tickets.dni')} {selected.attendeeDni}
              {selected.ticketCode ? ` · ${selected.ticketCode}` : ''}
            </p>
            <p className="buyer-tickets-wallet__sealed">
              {selectedRevealWhen
                ? t('pages.tickets.wallet.sealed', { when: selectedRevealWhen })
                : t('pages.tickets.wallet.sealedSoon')}
            </p>
            <p className="buyer-tickets-wallet__note">{t('pages.tickets.wallet.sealedNote')}</p>
          </div>
        </div>
      ) : null}

      {selected && qrReady && selected.qrToken ? (
        <div className="buyer-tickets-wallet__pass">
          <div ref={passRef}>
            <TicketPassPreview
              live
              interactive={false}
              attendeeName={selected.attendeeName}
              date={displayEventDate(selected, event, locale)}
              dayPassLabel={selectedDays?.label ?? ''}
              eventSlug={selected.eventSlug || event?.slug || ''}
              eventTitle={selected.eventTitle || event?.title || ''}
              displayCode={selected.gateCode || selected.ticketCode || ''}
              qrCode={selected.qrToken}
              venue={selected.eventVenue || event?.venue || ''}
            />
          </div>
          <div className="buyer-tickets-wallet__sheet">
            {selectedAccess.title ? (
              <p className="buyer-tickets-wallet__access">{selectedAccess.title}</p>
            ) : null}
            {selectedAccess.note ? (
              <p className="buyer-tickets-wallet__note">{selectedAccess.note}</p>
            ) : null}
            <p className="buyer-tickets-wallet__who">
              {t('pages.tickets.dni')} {selected.attendeeDni}
              {selected.ticketCode ? ` · ${selected.ticketCode}` : ''}
            </p>
            {(selectedDays?.days.length ?? 0) > 1 ? (
              <p className="buyer-tickets-wallet__note">{t('pages.tickets.wallet.sameQr')}</p>
            ) : null}
            {selected.addons?.length ? (
              <p className="buyer-tickets-wallet__note">
                {t('pages.tickets.redeemBenefits')}:{' '}
                {selected.addons.map((addon) => addon.label).join(' · ')}
              </p>
            ) : null}
            {selected.gateCode ? (
              <p className="buyer-tickets-wallet__gate">
                <span className="buyer-tickets-wallet__gate-label">
                  {t('pages.tickets.gateCodeLabel')}
                </span>
                <span className="buyer-tickets-wallet__gate-value">{selected.gateCode}</span>
                <span className="buyer-tickets-wallet__gate-hint">{t('pages.tickets.gateCodeHint')}</span>
                <button
                  type="button"
                  className="buyer-tickets-wallet__text"
                  onClick={() => speakDoorCode(selected.gateCode)}
                >
                  {t('pages.tickets.speakGateCode')}
                </button>
              </p>
            ) : null}
            <div className="buyer-tickets-wallet__actions">
              <button
                type="button"
                className="btn"
                disabled={downloading}
                onClick={() => handleDownload(selected)}
              >
                <Download size={15} aria-hidden />
                {downloading ? t('pages.tickets.downloadingPass') : t('pages.tickets.downloadPass')}
              </button>
              <button
                type="button"
                className="btn btn--outline"
                disabled={downloading}
                onClick={() => handlePrint(selected)}
              >
                <Printer size={15} aria-hidden />
                {t('pages.tickets.printPass')}
              </button>
            </div>
            {downloadError ? (
              <p className="buyer-tickets-wallet__error" role="alert">
                {downloadError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {qrReady && visibleTickets.length > 1 ? (
        <div className="buyer-tickets-wallet__strip" role="group">
          {visibleTickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              className="buyer-tickets-wallet__chip"
              aria-pressed={ticket.id === selected?.id}
              onClick={() => setPickedId(ticket.id)}
            >
              {ticket.attendeeName}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
