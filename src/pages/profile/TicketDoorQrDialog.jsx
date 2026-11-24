import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2, X } from 'lucide-react'
import { usePaymentModal } from '../../components/checkout/usePaymentModal.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { generateCredentialQr } from '../../lib/credentialQr.js'
import { formatDoorCode } from '../../lib/manualCheckinCode.js'
import { buildTicketQrUrl } from '../../lib/ticketAdmission.js'

/**
 * El QR tal como se muestra en la puerta: grande, sobre blanco y sin nada
 * encima. La card para redes (CardPreviewModal) lo achica a un rincón de una
 * pieza gráfica: sirve para compartir, no para que un celular con poca luz lo
 * lea al primer intento. Esa card queda como acción secundaria.
 */
export default function TicketDoorQrDialog({ ticket, onClose, onShare }) {
  const { t } = useI18n()
  const titleId = useId()
  const panelRef = usePaymentModal(onClose)
  const [qrSrc, setQrSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setQrSrc('')
    setFailed(false)
    generateCredentialQr(buildTicketQrUrl(ticket, ticket.eventSlug))
      .then((src) => {
        if (active) setQrSrc(src)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [ticket])

  return createPortal(
    <div className="ticket-door-qr">
      <button
        type="button"
        className="ticket-door-qr__backdrop"
        aria-label={t('account.tickets.close')}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="ticket-door-qr__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ticket-door-qr__head">
          <div>
            <span>{ticket.eventTitle}</span>
            <h2 id={titleId}>{ticket.attendeeName}</h2>
          </div>
          <button
            type="button"
            className="ticket-door-qr__close"
            aria-label={t('account.tickets.close')}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="ticket-door-qr__code" aria-live="polite">
          {qrSrc ? (
            <img src={qrSrc} alt={t('account.tickets.qrAlt', { code: ticket.ticketCode })} />
          ) : (
            <p>{failed ? t('account.tickets.qrError') : t('account.tickets.qrLoading')}</p>
          )}
        </div>

        {/* El plan B del QR: lo que la persona le dicta a seguridad. Va sólo
            acá y en la entrada, nunca en la card para redes (lo vería
            cualquiera que vea la historia). */}
        {ticket.doorCode ? (
          <div className="ticket-door-qr__door-code">
            <span id={`${titleId}-door`}>{t('account.tickets.doorCode')}</span>
            <strong aria-describedby={`${titleId}-door`}>{formatDoorCode(ticket.doorCode)}</strong>
          </div>
        ) : null}

        <dl className="ticket-door-qr__meta">
          <div>
            <dt>{t('account.tickets.credential')}</dt>
            <dd>{ticket.credentialLabel || ticket.ticketTypeName}</dd>
          </div>
          <div>
            <dt>{t('account.tickets.code')}</dt>
            <dd className="account-tickets__mono">{ticket.ticketCode}</dd>
          </div>
        </dl>
        <p className="ticket-door-qr__hint">{t('account.tickets.doorHint', { code: ticket.ticketCode })}</p>

        {onShare ? (
          <button type="button" className="ticket-door-qr__share" onClick={onShare}>
            <Share2 size={15} aria-hidden />
            {t('account.tickets.share')}
          </button>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
