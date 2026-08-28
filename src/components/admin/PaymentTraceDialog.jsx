import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Clock3, Copy, Info, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getPaymentOrderAudit } from '../../services/paymentService.js'
import { operatorFailureMessage } from '../../lib/auditPresentation.js'

/**
 * PaymentTraceDialog — PLU ARG
 *
 * Vida completa de un cobro, en una pantalla: qué se hizo, en qué orden,
 * cuánto tardó cada paso, dónde se rompió (archivo y línea), por dónde entró
 * la operación y cómo se resuelve.
 *
 * Reemplaza el recorrido que antes había que hacer cruzando cinco tablas en la
 * base para poder contestarle a un socio por qué no le figura la afiliación.
 */

const SEVERITY_ICON = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: Info,
}

const VERDICT_STATES = new Set(['ok', 'critical', 'blocked', 'expected', 'closed', 'pending'])

function formatWhen(value, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function stageLabel(stage, t) {
  if (!stage) return null
  const key = `admin.paymentTrace.stages.${stage}`
  const label = t(key)
  return label === key ? stage : label
}

function stateLabel(state, t) {
  if (!state || !VERDICT_STATES.has(state)) return null
  return t(`admin.paymentTrace.states.${state}`)
}

function TraceFailure({ failure, t }) {
  const operatorMessage = operatorFailureMessage(
    failure.message,
    failure.code ?? failure.provider?.code,
    failure.statusDetail,
  )
  return (
    <div className="payment-trace__failure">
      {failure.message ? (
        <>
          <p className="payment-trace__failure-message">{operatorMessage ?? failure.message}</p>
          {operatorMessage && operatorMessage !== failure.message ? (
            <details className="payment-trace__failure-technical">
              <summary>Mensaje técnico original</summary>
              <p>{failure.message}</p>
            </details>
          ) : null}
        </>
      ) : null}
      <dl className="payment-trace__failure-meta">
        {failure.origin ? (
          <div>
            <dt>{t('admin.paymentTrace.origin')}</dt>
            <dd>
              <code>
                {failure.origin.file}:{failure.origin.line}
                {failure.origin.function ? ` · ${failure.origin.function}` : ''}
              </code>
            </dd>
          </div>
        ) : null}
        {failure.entrypoint ? (
          <div>
            <dt>{t('admin.paymentTrace.entrypoint')}</dt>
            <dd>
              <code>{failure.entrypoint}</code>
            </dd>
          </div>
        ) : null}
        {failure.requestId ? (
          <div>
            <dt>{t('admin.paymentTrace.requestId')}</dt>
            <dd>
              <code>{failure.requestId}</code>
            </dd>
          </div>
        ) : null}
        {failure.provider?.code ? (
          <div>
            <dt>{t('admin.paymentTrace.providerCode')}</dt>
            <dd>
              <code>{failure.provider.code}</code>
              {failure.provider.detail ? ` — ${failure.provider.detail}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      {failure.diagnosis ? (
        <div className="payment-trace__diagnosis">
          <strong>{failure.diagnosis.title}</strong>
          <p>{failure.diagnosis.cause}</p>
          {failure.diagnosis.fix?.length ? (
            <ol>
              {failure.diagnosis.fix.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {failure.trail?.length ? (
        <details className="payment-trace__crumbs">
          <summary>{t('admin.paymentTrace.previousSteps')}</summary>
          <ol>
            {failure.trail.map((crumb, index) => (
              <li key={`${crumb.event}-${index}`}>
                <code>+{crumb.atMs ?? '?'}ms</code> {crumb.event}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {failure.stack ? (
        <details className="payment-trace__stack">
          <summary>{t('admin.paymentTrace.stack')}</summary>
          <pre>{failure.stack}</pre>
        </details>
      ) : null}
    </div>
  )
}

function CancellationSummary({ cancellation, locale, t }) {
  if (cancellation?.code !== 'expired_without_payment') return null

  const hasPaymentEvidence = cancellation.paymentEvidence || cancellation.providerPaymentStarted
  return (
    <section
      className="payment-trace__cancellation"
      aria-labelledby="payment-trace-cancellation-title"
    >
      <h3 id="payment-trace-cancellation-title" className="payment-trace__section-title">
        {t('admin.paymentTrace.cancellation.detailTitle')}
      </h3>
      <dl className="payment-trace__facts">
        <div>
          <dt>{t('admin.paymentTrace.cancellation.checkoutOpened')}</dt>
          <dd>{formatWhen(cancellation.checkoutOpenedAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('admin.paymentTrace.cancellation.expiresAt')}</dt>
          <dd>{formatWhen(cancellation.expiresAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('admin.paymentTrace.cancellation.cancelledAt')}</dt>
          <dd>{formatWhen(cancellation.cancelledAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('admin.paymentTrace.cancellation.paymentEvidence')}</dt>
          <dd>
            {hasPaymentEvidence
              ? t('admin.paymentTrace.cancellation.paymentEvidencePresent')
              : t('admin.paymentTrace.cancellation.paymentEvidenceAbsent')}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export default function PaymentTraceDialog({ orderId, onClose }) {
  const { locale, t } = useI18n()
  const titleId = useId()
  const timelineTitleId = useId()
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button')?.focus()

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeRef.current?.()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown, true)
      previousFocus?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!orderId) return undefined
    let cancelled = false
    setLoading(true)
    setError('')

    void getPaymentOrderAudit(orderId)
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message ?? t('admin.paymentTrace.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orderId, t])

  // El informe completo se copia como JSON: es lo que se adjunta a un reclamo
  // ante Mercado Pago o a un ticket interno sin tener que rehacer el relato.
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setError(t('admin.paymentTrace.copyError'))
    }
  }

  if (!orderId) return null

  const verdictState = report?.verdict?.state
  const reachedStage = stageLabel(report?.stageReached, t)
  const statusLabel = stateLabel(verdictState, t)

  return createPortal(
    <div className="payment-validation-dialog payment-trace">
      <button
        type="button"
        className="payment-validation-dialog__backdrop"
        aria-label={t('admin.paymentTrace.closeOverlay')}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="payment-validation-dialog__panel payment-trace__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="payment-validation-dialog__head payment-trace__head">
          <span className="payment-validation-dialog__eyebrow">
            {t('admin.paymentTrace.eyebrow')}
          </span>
          <h2 id={titleId}>{t('admin.paymentTrace.title')}</h2>
          <p className="payment-trace__order-id">
            <span className="payment-trace__order-id-label">{t('admin.paymentTrace.orderIdLabel')}</span>
            <code title={orderId}>{orderId}</code>
          </p>
        </header>

        {loading ? <p role="status">{t('admin.paymentTrace.loading')}</p> : null}
        {error ? (
          <p role="alert" className="payment-trace__error">
            {error}
          </p>
        ) : null}

        {report ? (
          <>
            <div
              className={`payment-trace__verdict payment-trace__verdict--${verdictState ?? 'pending'}`}
              role="status"
            >
              {statusLabel ? (
                <span className="payment-trace__state-chip">{statusLabel}</span>
              ) : null}
              <strong className="payment-trace__summary">{report.verdict.summary}</strong>
              {reachedStage ? (
                <p className="payment-trace__stage">
                  {t('admin.paymentTrace.stageReached')}: {reachedStage}
                </p>
              ) : null}
            </div>

            {report.verdict.action ? (
              <div className="payment-trace__action" role="note">
                <h3 className="payment-trace__section-title">{t('admin.paymentTrace.whatToDo')}</h3>
                <p>{report.verdict.action}</p>
              </div>
            ) : null}

            <CancellationSummary cancellation={report.cancellation} locale={locale} t={t} />

            <section className="payment-trace__timeline-section" aria-labelledby={timelineTitleId}>
              <h3 id={timelineTitleId} className="payment-trace__section-title">
                {t('admin.paymentTrace.timelineTitle')}
              </h3>
              <ol className="payment-trace__timeline">
                {report.timeline.map((item, index) => {
                  const Icon = SEVERITY_ICON[item.severity] ?? Clock3
                  return (
                    <li
                      key={`${item.event}-${item.at}-${index}`}
                      className={`payment-trace__step payment-trace__step--${item.severity}`}
                    >
                      <span className="payment-trace__step-icon" aria-hidden>
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      <div className="payment-trace__step-body">
                        <p className="payment-trace__step-head">
                          <code className="payment-trace__step-source">{item.source}</code>
                          <strong>{item.event}</strong>
                          {item.status ? <span>{item.status}</span> : null}
                          {item.sincePrevious ? (
                            <em className="payment-trace__step-gap">+{item.sincePrevious}</em>
                          ) : null}
                        </p>
                        <p className="payment-trace__step-when">{formatWhen(item.at, locale)}</p>
                        {item.failure ? <TraceFailure failure={item.failure} t={t} /> : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          </>
        ) : null}

        <footer className="payment-trace__actions">
          <Button variant="outline" className="btn--small" onClick={copyReport} disabled={!report}>
            <Copy size={14} aria-hidden />
            {copied ? t('admin.paymentTrace.copied') : t('admin.paymentTrace.copy')}
          </Button>
          <Button className="btn--small" onClick={onClose}>
            <X size={14} aria-hidden /> {t('common.close')}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
