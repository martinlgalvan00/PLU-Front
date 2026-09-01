import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, FileWarning, BadgeCheck, X, XCircle } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatRejectionActor } from '../../lib/paymentAudit.js'
import { getAthletePaymentProofUrl } from '../../services/athleteApi.js'
import { getTicketPaymentProofUrl } from '../../services/ticketApi.js'
import {
  PROOF_OVERRIDE_REASON_MIN_LENGTH,
  isProofOverrideReasonValid,
} from '../../services/paymentValidationService.js'

function guessProofKind(...sources) {
  for (const source of sources) {
    const path = String(source ?? '')
      .split('?')[0]
      .toLowerCase()
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path)) return 'image'
    if (/\.pdf$/.test(path)) return 'pdf'
  }
  return 'unknown'
}

/**
 * Revisión de un pago desde la cola operativa.
 * `validate` muestra el comprobante y pide confirmación.
 * `view` solo inspecciona el adjunto; no acredita.
 * `settle` acredita a mano una orden que el proveedor dio por perdida: mismo
 * comprobante y misma revisión, pero exige motivo porque es la única acción del
 * panel que suma un cobro al reporte financiero sin confirmación de Mercado
 * Pago. Es un modo del mismo diálogo y no un componente aparte porque la
 * evidencia que hay que mirar antes de decidir es exactamente la misma.
 */
export default function PaymentValidationDialog({
  item,
  mode = 'validate',
  busy = false,
  error = '',
  onCancel,
  onConfirm,
  onReject,
}) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const settleReasonId = useId()
  const settleReferenceId = useId()
  const overrideReasonId = useId()
  const panelRef = useRef(null)
  const dialogStateRef = useRef({ busy, onCancel, rejecting: false })

  const proofPath =
    typeof item?.paymentProofPath === 'string'
      ? item.paymentProofPath.trim()
      : item?.paymentProofPath
  const hasProof = Boolean(item?.hasProof || proofPath)
  // La bandeja ya firmó la URL de las filas abiertas: cuando viaja en el item,
  // el comprobante se dibuja en el primer render y no hay spinner que esperar.
  const preloadedProofUrl = item?.proofUrl ?? null
  const [proofUrl, setProofUrl] = useState(preloadedProofUrl)
  const [proofLoading, setProofLoading] = useState(hasProof && !preloadedProofUrl)
  const [proofError, setProofError] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [settleReason, setSettleReason] = useState('')
  const [settleReference, setSettleReference] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const rejectReasonValid = rejectReason.trim().length >= 3
  const settleReasonValid = settleReason.trim().length >= 3
  const overrideReasonValid = isProofOverrideReasonValid(overrideReason)
  dialogStateRef.current = { busy, onCancel, rejecting }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('.payment-validation-dialog__actions button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (dialogStateRef.current.rejecting) {
          setRejecting(false)
          return
        }
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

    setImageFailed(false)
    setImageExpanded(false)
    if (preloadedProofUrl) {
      setProofUrl(preloadedProofUrl)
      setProofLoading(false)
      setProofError('')
      return undefined
    }

    let cancelled = false
    setProofLoading(true)
    setProofError('')
    setProofUrl(null)

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
  }, [hasProof, item, preloadedProofUrl, t])

  if (!item) return null

  const isView = mode === 'view'
  const isSettle = mode === 'settle'
  const needsProofOverride = Boolean(item.requiresProofOverride) && !isSettle && !isView
  const typeLabel = t(`admin.actionQueue.types.${item.type}`)
  const previewKind = guessProofKind(item.paymentProofPath, proofUrl)
  const showImage = Boolean(
    proofUrl && !imageFailed && (previewKind === 'image' || previewKind === 'unknown'),
  )
  const showEmbed = Boolean(
    proofUrl && (previewKind === 'pdf' || (previewKind === 'unknown' && imageFailed)),
  )
  const showFallback = Boolean(proofUrl && previewKind === 'image' && imageFailed)
  // El archivo tiene que haberse abierto correctamente antes de permitir una
  // decisión. La existencia de una ruta no alcanza como prueba revisada.
  const proofReadyForReview = hasProof && !proofLoading && Boolean(proofUrl) && !proofError
  // Acreditar a mano siempre exige comprobante abierto. Validar transferencia
  // sin archivo exige motivo de override (≥ 8); efectivo no pide archivo.
  const canDecide = isSettle
    ? proofReadyForReview && settleReasonValid
    : item.cashAtPitbull || proofReadyForReview || (needsProofOverride && overrideReasonValid)
  // Sin proof: efectivo, override o declaración — el rechazo sigue pidiendo
  // motivo en el formulario de abajo; no bloqueamos el botón solo por falta
  // de archivo.
  const showReject = Boolean(onReject) && !isSettle && (hasProof || item.cashAtPitbull || needsProofOverride)
  const noProofLead = isSettle
    ? t('admin.paymentValidation.settleNoProofLead')
    : item.cashAtPitbull
      ? 'Confirmá que el efectivo fue recibido en Pitbull antes de acreditar la orden.'
      : needsProofOverride
        ? t('admin.paymentValidation.overrideNoProofLead')
        : isView
          ? t('admin.paymentValidation.viewNoProofLead')
          : t('admin.paymentValidation.noProofLead')

  const panelClassName = [
    'payment-validation-dialog__panel',
    'payment-validation-dialog__panel--workspace',
    isView ? 'payment-validation-dialog__panel--view' : '',
    !hasProof ? 'payment-validation-dialog__panel--empty-proof' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const proofBlock = (
    <div className="payment-validation-dialog__proof" aria-live="polite">
      {!hasProof ? (
        <div className="payment-validation-dialog__empty payment-validation-dialog__empty--workspace" role="status">
          <span className="payment-validation-dialog__empty-icon" aria-hidden>
            <FileWarning size={20} />
          </span>
          <div>
            {isView ? (
              <span className="payment-validation-dialog__empty-state">
                {t('admin.paymentValidation.proofPending')}
              </span>
            ) : null}
            <strong>
              {item.cashAtPitbull
                ? 'Cobro presencial en Pitbull'
                : t('admin.paymentValidation.noProofTitle')}
            </strong>
            <p>{noProofLead}</p>
          </div>
        </div>
      ) : null}

      {hasProof && proofLoading ? (
        <div className="payment-validation-dialog__loading" role="status">
          <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
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
          <div className="payment-validation-dialog__proof-toolbar">
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
          <div className="payment-validation-dialog__stage">
            {showImage ? (
              <button
                type="button"
                className={`payment-validation-dialog__image-btn${imageExpanded ? ' is-expanded' : ''}`}
                aria-expanded={imageExpanded}
                aria-label={
                  imageExpanded
                    ? t('admin.paymentValidation.collapseProof')
                    : t('admin.paymentValidation.expandProof')
                }
                onClick={() => setImageExpanded((current) => !current)}
              >
                <img
                  src={proofUrl}
                  alt={t('admin.paymentValidation.proofAlt')}
                  className="payment-validation-dialog__image"
                  onError={() => setImageFailed(true)}
                />
              </button>
            ) : null}
            {showEmbed ? (
              <iframe
                title={t('admin.paymentValidation.proofAlt')}
                src={proofUrl}
                className="payment-validation-dialog__frame"
              />
            ) : null}
            {showFallback ? (
              <p className="payment-validation-dialog__preview-fallback">
                {t('admin.paymentValidation.previewFallback')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )

  const railBlock = (
    <div className="payment-validation-dialog__rail">
      <header className="payment-validation-dialog__head">
        <div className="payment-validation-dialog__head-copy">
          <span className="payment-validation-dialog__eyebrow">{typeLabel}</span>
          <h2 id={titleId}>
            {isSettle
              ? t('admin.paymentValidation.settleTitle')
              : isView
                ? t('admin.paymentValidation.viewTitle')
                : t('admin.paymentValidation.title')}
          </h2>
          <p id={descriptionId} className="payment-validation-dialog__lead">
            {isSettle
              ? t('admin.paymentValidation.settleLead')
              : isView
                ? t('admin.paymentValidation.viewLead')
                : t('admin.paymentValidation.lead')}
          </p>
        </div>
        <button
          type="button"
          className="payment-validation-dialog__dismiss"
          disabled={busy}
          aria-label={t('admin.paymentValidation.close')}
          onClick={onCancel}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <dl className="payment-validation-dialog__meta payment-validation-dialog__meta--rail">
        <div>
          <dt>{t('admin.paymentValidation.subject')}</dt>
          <dd>{item.subject}</dd>
        </div>
        {item.meta ? (
          <div>
            <dt>{t('admin.paymentValidation.amount')}</dt>
            <dd className="payment-validation-dialog__amount">{item.meta}</dd>
          </div>
        ) : null}
        {item.detail ? (
          <div>
            <dt>{t('admin.paymentValidation.detail')}</dt>
            <dd>{item.detail}</dd>
          </div>
        ) : null}
        {item.documentId ? (
          <div>
            <dt>{t('admin.paymentValidation.document')}</dt>
            <dd className="payment-validation-dialog__id" title={item.documentId}>
              {item.documentId}
            </dd>
          </div>
        ) : null}
        {item.notes ? (
          <div>
            <dt>{t('admin.paymentValidation.notes')}</dt>
            <dd>{item.notes}</dd>
          </div>
        ) : null}
        {item.paymentProofUploadedAt ? (
          <div>
            <dt>{t('admin.paymentValidation.proofReceivedAt')}</dt>
            <dd>
              {new Date(item.paymentProofUploadedAt).toLocaleString(
                locale === 'en' ? 'en-US' : 'es-AR',
              )}
            </dd>
          </div>
        ) : null}
        {/* Órdenes ya rechazadas: la decisión previa queda a la vista antes
            de cualquier acción nueva — mismo dato que la bandeja. */}
        {item.rejectedBy || item.rejectionReason ? (
          <div className="payment-validation-dialog__rejection-row">
            <dt>{t('admin.paymentValidation.rejectedByLabel')}</dt>
            <dd>
              <strong>{formatRejectionActor(item.rejectedBy, t)}</strong>
              {item.rejectionReason ? <span>{item.rejectionReason}</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {proofBlock}

      {error ? (
        <p className="payment-validation-dialog__error" role="alert">
          {error}
        </p>
      ) : null}

      {isSettle ? (
        <div className="payment-validation-dialog__settle-form">
          <p className="payment-validation-dialog__settle-note" role="note">
            {t('admin.paymentValidation.settleAuditNote')}
          </p>
          <label htmlFor={settleReasonId}>{t('admin.paymentValidation.settleReasonLabel')}</label>
          <textarea
            id={settleReasonId}
            rows={3}
            value={settleReason}
            disabled={busy}
            required
            aria-describedby={`${settleReasonId}-hint`}
            placeholder={t('admin.paymentValidation.settleReasonPlaceholder')}
            onChange={(event) => setSettleReason(event.target.value)}
          />
          <span id={`${settleReasonId}-hint`} className="payment-validation-dialog__settle-hint">
            {t('admin.paymentValidation.settleReasonHint')}
          </span>
          <label htmlFor={settleReferenceId}>
            {t('admin.paymentValidation.settleReferenceLabel')}
          </label>
          <input
            id={settleReferenceId}
            type="text"
            value={settleReference}
            disabled={busy}
            maxLength={120}
            placeholder={t('admin.paymentValidation.settleReferencePlaceholder')}
            onChange={(event) => setSettleReference(event.target.value)}
          />
        </div>
      ) : null}

      {needsProofOverride && !rejecting ? (
        <div className="payment-validation-dialog__settle-form">
          <p className="payment-validation-dialog__settle-note" role="note">
            {t('admin.paymentValidation.overrideAuditNote')}
          </p>
          <label htmlFor={overrideReasonId}>
            {t('admin.paymentValidation.overrideReasonLabel')}
          </label>
          <textarea
            id={overrideReasonId}
            rows={3}
            value={overrideReason}
            disabled={busy}
            required
            minLength={PROOF_OVERRIDE_REASON_MIN_LENGTH}
            aria-describedby={`${overrideReasonId}-hint`}
            placeholder={t('admin.paymentValidation.overrideReasonPlaceholder')}
            onChange={(event) => setOverrideReason(event.target.value)}
          />
          <span id={`${overrideReasonId}-hint`} className="payment-validation-dialog__settle-hint">
            {t('admin.paymentValidation.overrideReasonHint')}
          </span>
        </div>
      ) : null}

      {rejecting ? (
        <div className="payment-validation-dialog__reject-form">
          {item.financingAllowed && item.financedEntitlementsAt ? (
            <p className="payment-validation-dialog__financing-warning" role="alert">
              <FileWarning size={16} aria-hidden />
              {t('admin.paymentValidation.rejectRevokesFinancing')}
            </p>
          ) : null}
          <label htmlFor={reasonId}>{t('admin.paymentValidation.rejectReasonLabel')}</label>
          <textarea
            id={reasonId}
            rows={3}
            value={rejectReason}
            disabled={busy}
            placeholder={t('admin.paymentValidation.rejectReasonPlaceholder')}
            onChange={(event) => setRejectReason(event.target.value)}
          />
        </div>
      ) : null}

      <div className="payment-validation-dialog__actions">
        {rejecting ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              {t('admin.paymentValidation.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy || !rejectReasonValid}
              onClick={() => onReject(rejectReason.trim())}
            >
              {busy ? (
                <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
              ) : (
                <XCircle size={15} aria-hidden />
              )}
              {busy
                ? t('admin.paymentValidation.rejecting')
                : t('admin.paymentValidation.rejectConfirm')}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
              {isView ? t('admin.paymentValidation.close') : t('admin.paymentValidation.cancel')}
            </Button>
            {isView ? null : (
              <>
                {showReject ? (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={
                      busy ||
                      !(item.cashAtPitbull || needsProofOverride || proofReadyForReview)
                    }
                    onClick={() => setRejecting(true)}
                  >
                    <XCircle size={15} aria-hidden />
                    {t('admin.paymentValidation.reject')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={busy || !canDecide}
                  onClick={() =>
                    isSettle
                      ? onConfirm({
                          reason: settleReason.trim(),
                          reference: settleReference.trim(),
                        })
                      : needsProofOverride
                        ? onConfirm({ overrideReason: overrideReason.trim() })
                        : onConfirm()
                  }
                >
                  {busy ? (
                    <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
                  ) : (
                    <BadgeCheck size={15} aria-hidden />
                  )}
                  {busy
                    ? t('admin.paymentValidation.confirming')
                    : isSettle
                      ? t('admin.paymentValidation.settleConfirm')
                      : t('admin.paymentValidation.confirm')}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )

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
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {railBlock}
      </section>
    </div>,
    document.body,
  )
}
