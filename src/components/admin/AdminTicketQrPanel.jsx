import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Download, ShieldPlus, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import CredentialQr from '../ui/CredentialQr.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { ticketTypeNameParts } from '../../lib/eventPricing.js'
import {
  buildBuyerTicketsUrl,
  buildTicketQrUrl,
  ticketAdmissionState,
  ticketHasUsableQr,
  ticketQrFileName,
} from '../../lib/ticketAdmission.js'
import { useAdminModal } from './useAdminModal.js'
import '../../styles/pages/admin-event-tickets.css'

function formatDateTime(value, locale) {
  if (!value) return null
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Una entrada vendida con su QR: lo que el operador necesita cuando alguien
 * escribe "no me llegó la entrada" o "no me deja pasar".
 *
 * Panel lateral (misma familia que Mi cuenta) en vez de más columnas en la
 * tabla: el comprador, el medio de pago y la vigencia se consultan de a una
 * entrada, no se comparan fila contra fila.
 *
 * El QR sólo se dibuja con la entrada acreditada. Una sin pagar o cancelada no
 * abre ninguna puerta, y mostrarla invitaba a mandar por WhatsApp una imagen
 * que la puerta rechaza.
 *
 * No reemite ni reemplaza el QR (el token es inmutable): la única corrección
 * de acceso es la excepción individual de vigencia, que abre su propio diálogo.
 */
export default function AdminTicketQrPanel({
  canOverride = false,
  eventSlug,
  onClose,
  onOverride,
  ticket,
}) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const panelRef = useAdminModal(() => onClose())
  const [qrSrc, setQrSrc] = useState(null)
  const [qrFailed, setQrFailed] = useState(false)

  const usable = ticketHasUsableQr(ticket)
  const admission = ticketAdmissionState(ticket)
  const buyerUrl = buildBuyerTicketsUrl(ticket.order?.reference)
  const typeParts = ticketTypeNameParts(ticket.ticketTypeName, locale)
  const credential =
    ticket.credentialLabel && ticket.credentialLabel !== ticket.ticketTypeName
      ? ticket.credentialLabel
      : null
  const checkedInAt = formatDateTime(ticket.checkIn?.scannedAt, locale)
  const validFrom = formatDateTime(ticket.validFrom, locale)
  const validUntil = formatDateTime(ticket.validUntil, locale)
  const buyer = [ticket.order?.buyerName, ticket.order?.buyerEmail].filter(Boolean).join(' · ')

  useEffect(() => {
    if (!usable) {
      setQrSrc(null)
      setQrFailed(false)
      return undefined
    }
    let cancelled = false
    setQrSrc(null)
    setQrFailed(false)
    generateCredentialQr(buildTicketQrUrl(ticket, eventSlug))
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [eventSlug, ticket, usable])

  async function copyBuyerLink() {
    try {
      await navigator.clipboard.writeText(buyerUrl)
      notifySuccess(t('admin.eventTicketsSold.qr.linkCopied'))
    } catch {
      notifyError(t('admin.eventTicketsSold.qr.copyFailed'))
    }
  }

  function downloadQr() {
    if (!qrSrc) return
    const link = document.createElement('a')
    link.href = qrSrc
    link.download = ticketQrFileName(ticket)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const admissionDetail =
    admission === 'used' && checkedInAt
      ? [checkedInAt, ticket.checkIn?.gate].filter(Boolean).join(' · ')
      : admission === 'ready' && validFrom && validUntil
        ? `${validFrom} → ${validUntil}`
        : null

  const details = [
    [t('admin.eventTicketsSold.qr.buyer'), buyer],
    [t('admin.eventTicketsSold.qr.reference'), ticket.order?.reference],
    [t('admin.eventTicketsSold.qr.price'), money(ticket.unitPrice, locale)],
    [
      t('admin.eventTicketsSold.qr.validity'),
      validFrom && validUntil && admission !== 'ready' ? `${validFrom} → ${validUntil}` : null,
    ],
  ].filter(([, value]) => Boolean(value))
  const typeLine = [typeParts.title, credential].filter(Boolean).join(' · ')
  const showDownload = usable
  const showCopy = Boolean(buyerUrl) && usable
  const showOverride = Boolean(canOverride && onOverride) && usable
  const hasActions = showDownload || showCopy || showOverride

  return createPortal(
    <div className="ticket-qr-panel">
      <button
        type="button"
        className="ticket-qr-panel__backdrop"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="ticket-qr-panel__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ticket-qr-panel__head">
          <div className="ticket-qr-panel__identity">
            <span className="ticket-qr-panel__eyebrow">{t('admin.eventTicketsSold.qr.eyebrow')}</span>
            <h2 id={titleId}>{ticket.attendeeName || '—'}</h2>
            <p>{[ticket.attendeeDni, ticket.ticketCode].filter(Boolean).join(' · ')}</p>
            {typeLine ? <p className="ticket-qr-panel__type">{typeLine}</p> : null}
          </div>
          <button
            type="button"
            className="ticket-qr-panel__close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="ticket-qr-panel__body">
          {usable ? (
            <div className="ticket-qr-panel__code">
              <CredentialQr
                size="lg"
                src={qrSrc}
                failed={qrFailed}
                alt={t('admin.eventTicketsSold.qr.alt', { name: ticket.attendeeName })}
              />
            </div>
          ) : null}

          <p className={`ticket-qr-panel__state ticket-qr-panel__state--${admission}`} role="status">
            <span aria-hidden className="ticket-qr-panel__dot" />
            <span>
              <strong>{t(`admin.eventTicketsSold.qr.state.${admission}`)}</strong>
              {admissionDetail ? <small>{admissionDetail}</small> : null}
              <small>{t(`admin.eventTicketsSold.qr.hint.${admission}`)}</small>
            </span>
          </p>

          {details.length > 0 ? (
            <dl className="ticket-qr-panel__facts">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {hasActions ? (
          <footer className="ticket-qr-panel__actions">
            {showDownload ? (
              <Button type="button" variant="gold" disabled={!qrSrc} onClick={downloadQr}>
                <Download size={15} aria-hidden />
                {t('admin.eventTicketsSold.qr.download')}
              </Button>
            ) : null}
            {showCopy ? (
              <button type="button" className="ticket-qr-panel__secondary" onClick={copyBuyerLink}>
                <Copy size={15} aria-hidden />
                {t('admin.eventTicketsSold.qr.copyLink')}
              </button>
            ) : null}
            {showOverride ? (
              <button type="button" className="ticket-qr-panel__tertiary" onClick={onOverride}>
                <ShieldPlus size={15} aria-hidden />
                {t('admin.eventTicketsSold.qr.override')}
              </button>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
