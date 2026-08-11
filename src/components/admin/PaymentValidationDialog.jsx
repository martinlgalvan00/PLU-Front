import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, FileWarning, LoaderCircle, BadgeCheck } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getAthletePaymentProofUrl } from '../../services/athleteApi.js'
import { getTicketPaymentProofUrl } from '../../services/ticketApi.js'

function guessProofKind(url) {
  const path = String(url ?? '').split('?')[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path)) return 'image'
  if (/\.pdf$/.test(path)) return 'pdf'
  return 'unknown'
}

/**
 * Revisión previa a aprobar un pago desde la cola operativa.
 * Carga la signed URL del comprobante (si hay) y solo confirma al staff.
 */
export default function PaymentValidationDialog({
  item,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ busy, onCancel })
  dialogStateRef.current = { busy, onCancel }

  const hasProof = Boolean(item?.hasProof)
  const [proofUrl, setProofUrl] = useState(null)
  const [proofLoading, setProofLoading] = useState(hasProof)
  const [proofError, setProofError] = useState('')
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        dialogStateRef.current.onCancel()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll(
        'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown, true)
      previousFocus?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!item || !hasProof) {
      setProofLoading(false)
      return undefined
    }

    let cancelled = false
    setProofLoading(true)
    setProofError('')
    setProofUrl(null)
    setPreviewFailed(false)

    const load = item.paymentId
      ? getAthletePaymentProofUrl(item.paymentId)
      : getTicketPaymentProofUrl(item.orderId)

    void load
      .then((url) => {
        if (cancelled) return
        setProofUrl(url)
      })
      .catch((loadError) => {
        if (cancelled) return
        setProofError(loadError?.message ?? t('admin.paymentValidation.proofError'))
      })
      .finally(() => {
        if (!cancelled) setProofLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hasProof, item, t])

  if (!item) return null

  const typeLabel = t(`admin.actionQueue.types.${item.type}`)
  const previewKind = guessProofKind(proofUrl)
  const showImage = Boolean(proofUrl && !previewFailed && previewKind === 'image')
  const showEmbed = Boolean(proofUrl && !previewFailed && !showImage)

  return createPortal(
    <div className="payment-validation-dialog">
      <button
        type="button"
        className="payment-validation-dialog__backdrop"
        aria-label={t('admin.paymentValidation.closeOverlay')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="payment-validation-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="payment-validation-dialog__head">
          <span className="payment-validation-dialog__eyebrow">{typeLabel}</span>
          <h2 id={titleId}>{t('admin.paymentValidation.title')}</h2>
          <p id={descriptionId} className="payment-validation-dialog__lead">
            {t('admin.paymentValidation.lead')}
          </p>
        </header>

        <dl className="payment-validation-dialog__meta">
          <div>
            <dt>{t('admin.paymentValidation.subject')}</dt>
            <dd>{item.subject}</dd>
          </div>
          {item.detail ? (
            <div>
              <dt>{t('admin.paymentValidation.detail')}</dt>
              <dd>{item.detail}</dd>
            </div>
          ) : null}
          {item.meta ? (
            <div>
              <dt>{t('admin.paymentValidation.amount')}</dt>
              <dd className="payment-validation-dialog__amount">{item.meta}</dd>
            </div>
          ) : null}
        </dl>

        <div className="payment-validation-dialog__proof" aria-live="polite">
          {!hasProof ? (
            <div className="payment-validation-dialog__empty" role="status">
              <FileWarning size={18} aria-hidden />
              <div>
                <strong>{t('admin.paymentValidation.noProofTitle')}</strong>
                <p>{t('admin.paymentValidation.noProofLead')}</p>
              </div>
            </div>
          ) : null}

          {hasProof && proofLoading ? (
            <div className="payment-validation-dialog__loading" role="status">
              <LoaderCircle size={18} aria-hidden className="is-spinning" />
              <span>{t('admin.paymentValidation.proofLoading')}</span>
            </div>
          ) : null}

          {hasProof && !proofLoading && proofError ? (
            <div className="payment-validation-dialog__empty" role="alert">
              <FileWarning size={18} aria-hidden />
              <div>
                <strong>{t('admin.paymentValidation.proofErrorTitle')}</strong>
                <p>{proofError}</p>
              </div>
            </div>
          ) : null}

          {hasProof && !proofLoading && proofUrl ? (
            <div className="payment-validation-dialog__preview">
              {showImage ? (
                <img
                  src={proofUrl}
                  alt={t('admin.paymentValidation.proofAlt')}
                  className="payment-validation-dialog__image"
                  onError={() => setPreviewFailed(true)}
                />
              ) : null}
              {showEmbed ? (
                <iframe
                  title={t('admin.paymentValidation.proofAlt')}
                  src={proofUrl}
                  className="payment-validation-dialog__frame"
                />
              ) : null}
              {previewFailed ? (
                <p className="payment-validation-dialog__preview-fallback">
                  {t('admin.paymentValidation.previewFallback')}
                </p>
              ) : null}
              <a
                className="payment-validation-dialog__open"
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} aria-hidden />
                {t('admin.paymentValidation.openTab')}
              </a>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="payment-validation-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="payment-validation-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.paymentValidation.cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <BadgeCheck size={15} aria-hidden />
            )}
            {busy
              ? t('admin.paymentValidation.confirming')
              : t('admin.paymentValidation.confirm')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
