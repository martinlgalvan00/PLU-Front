import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, FileCode2, History, Info, TriangleAlert, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { auditLabels } from '../../i18n/adminHelpers.js'
import es from '../../i18n/locales/es.js'
import { translate } from '../../i18n/translate.js'
import { fetchAuditEventContext, residualMetadata } from '../../services/auditService.js'

/**
 * AuditEventDialog — PLU ARG
 *
 * La tabla de auditoría mostraba el mensaje del error y nada más. Todo lo que
 * hace falta para diagnosticar —código, status HTTP, archivo y línea de origen,
 * stack completo, cadena de causas, diagnóstico de negocio— ya se guardaba en
 * `metadata` desde el primer día, pero no había forma de abrirlo: había que
 * consultar la base a mano.
 *
 * Y la pregunta que más se repite frente a una falla —"¿qué venía haciendo esta
 * persona?"— no la contestaba nadie: la respuesta estaba en la bitácora,
 * repartida en filas que nadie cruzaba.
 *
 * Los tres ejes de contexto van separados y no en un timeline único a propósito.
 * Tienen fuerza probatoria distinta: `request` es causalidad real (misma llamada
 * HTTP), `actor` y `entity` son correlación temporal. Mezclarlos daría algo que
 * parece una cadena de causas sin serlo, que es peor que no mostrar nada.
 */

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAuditTerm(t, group, value) {
  if (!value) return null
  const key = `admin.audit.${group}.${String(value).toLowerCase()}`
  const translated = t(key)
  return translated === key ? String(value) : translated
}

function formatSeverity(t, severity) {
  if (!severity) return '—'
  const key = `admin.audit.severities.${String(severity).toLowerCase()}`
  const translated = t(key)
  return translated === key ? String(severity) : translated
}

/** Fila `clave: valor` que sólo existe si hay valor. */
function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * Origen del error como `archivo:línea` — la coordenada que lleva directo al
 * código, sin tener que leer el stack entero para encontrarla.
 */
function OriginLine({ origin }) {
  if (!origin?.file) return null
  const position = [origin.line, origin.column].filter((value) => value != null).join(':')
  return (
    <code className="audit-detail__origin">
      {origin.file}
      {position ? `:${position}` : ''}
      {origin.function ? ` · ${origin.function}()` : ''}
    </code>
  )
}

/** Lista compacta de eventos correlacionados. */
function ContextList({ entries, emptyLabel, labels, onOpen, currentId }) {
  if (!entries.length) return <p className="audit-detail__empty">{emptyLabel}</p>
  return (
    <ol className="audit-detail__timeline">
      {entries.map((entry) => (
        <li key={entry.id} className={entry.id === currentId ? 'is-current' : ''}>
          <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
          <span
            className={`status-pill status-pill--${entry.tone === 'default' ? 'neutral' : entry.tone}`}
          >
            {labels.action(entry.action)}
          </span>
          <span className="audit-detail__timeline-entity">
            {labels.entity(entry.entityType)}
            {entry.status ? ` · ${labels.status(entry.status)}` : ''}
          </span>
          {entry.errorDetail?.message ? (
            <span className="audit-detail__timeline-error">
              {entry.errorDetail.operatorMessage ?? entry.errorDetail.message}
            </span>
          ) : null}
          {entry.id === currentId ? null : (
            <button type="button" onClick={() => onOpen(entry.id)}>
              {labels.openLabel}
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

export default function AuditEventDialog({ eventId, onClose }) {
  const t = useCallback((key, vars) => translate(es, key, vars), [])
  const titleId = useId()
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // El id es estado propio: desde el contexto se puede saltar a otro evento sin
  // cerrar y reabrir el diálogo, que es como se recorre una cadena de fallas.
  const [currentId, setCurrentId] = useState(eventId)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => setCurrentId(eventId), [eventId])

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
    if (!currentId) return undefined
    let cancelled = false
    setLoading(true)
    setError('')

    void fetchAuditEventContext(currentId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message ?? t('admin.auditDetail.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentId, t])

  const labels = auditLabels(es)
  const contextLabels = { ...labels, openLabel: t('admin.auditDetail.open') }
  const event = data?.event
  const failure = event?.errorDetail
  const context = data?.context
  const residual = event ? residualMetadata(event.metadata) : {}

  /** Todo el evento como JSON: es lo que se pega en un ticket o un reclamo. */
  async function copyEvent() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setError(t('admin.auditDetail.copyError'))
    }
  }

  if (!eventId) return null

  return createPortal(
    <div className="payment-validation-dialog audit-detail">
      <button
        type="button"
        className="payment-validation-dialog__backdrop"
        aria-label={t('admin.auditDetail.closeOverlay')}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="payment-validation-dialog__panel audit-detail__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="payment-validation-dialog__head">
          <span className="payment-validation-dialog__eyebrow">
            {t('admin.auditDetail.eyebrow')}
          </span>
          <h2 id={titleId}>{event ? labels.action(event.action) : t('admin.auditDetail.title')}</h2>
          {event ? (
            <p className="payment-validation-dialog__lead">
              {[
                labels.source(event.source),
                event.status ? labels.status(event.status) : null,
                formatDateTime(event.createdAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          <Button variant="ghost" size="small" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} aria-hidden />
          </Button>
        </header>

        {loading ? <p role="status">{t('admin.auditDetail.loading')}</p> : null}
        {error ? (
          <p role="alert" className="audit-detail__error">
            {error}
          </p>
        ) : null}

        {event && !loading ? (
          <div className="audit-detail__body">
            {/* Qué pasó: los hechos duros, antes de cualquier interpretación. */}
            <section className="audit-detail__block">
              <h3>
                <Info size={15} aria-hidden /> {t('admin.auditDetail.whatTitle')}
              </h3>
              <dl className="audit-detail__facts">
                <Fact label={t('admin.auditDetail.factEntity')}>
                  {`${labels.entity(event.entityType)} · ${event.entityId ?? '—'}`}
                </Fact>
                <Fact label={t('admin.auditDetail.factActor')}>
                  {`${labels.actor(event.actorType)}${event.actorId ? ` · ${event.actorId}` : ''}`}
                </Fact>
                <Fact label={t('admin.auditDetail.factSeverity')}>
                  {formatSeverity(t, event.severity)}
                </Fact>
                <Fact label={t('admin.auditDetail.factRequestId')}>
                  {failure?.requestId ? <code>{failure.requestId}</code> : null}
                </Fact>
              </dl>
            </section>

            {failure ? (
              <section className="audit-detail__block audit-detail__block--failure">
                <h3>
                  <TriangleAlert size={15} aria-hidden /> {t('admin.auditDetail.failureTitle')}
                </h3>

                {failure.diagnosis || failure.reason || failure.statusDetail ? (
                  <div className="audit-detail__why audit-detail__why--lead">
                    <h4>{t('admin.auditDetail.whyTitle')}</h4>

                    {failure.diagnosis?.title ? (
                      <p className="audit-detail__diagnosis-title">
                        {failure.diagnosis.title}
                        {failure.diagnosis.retryable === false ? (
                          <span className="audit-detail__tag">
                            {t('admin.auditDetail.notRetryable')}
                          </span>
                        ) : null}
                        {failure.diagnosis.retryable === true ? (
                          <span className="audit-detail__tag audit-detail__tag--ok">
                            {t('admin.auditDetail.retryable')}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {failure.diagnosis?.cause ? <p>{failure.diagnosis.cause}</p> : null}
                    {failure.reason ? <p>{String(failure.reason)}</p> : null}
                    {failure.statusDetail ? (
                      <p>
                        <code>{String(failure.statusDetail)}</code>
                      </p>
                    ) : null}

                    {failure.diagnosis?.fix?.length ? (
                      <>
                        <h4>{t('admin.auditDetail.fixTitle')}</h4>
                        <ol className="audit-detail__fix">
                          {failure.diagnosis.fix.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {failure.message ? (
                  <>
                    <p className="audit-detail__message">
                      {failure.operatorMessage ?? failure.message}
                    </p>
                    {failure.operatorMessage && failure.operatorMessage !== failure.message ? (
                      <details className="audit-detail__provider-message">
                        <summary>{t('admin.auditDetail.providerMessage')}</summary>
                        <p>{failure.message}</p>
                      </details>
                    ) : null}
                  </>
                ) : null}

                <details className="audit-detail__technical">
                  <summary>{t('admin.audit.technicalDetails')}</summary>
                  <dl className="audit-detail__facts">
                    <Fact label={t('admin.auditDetail.factCode')}>
                      {failure.code ? <code>{failure.code}</code> : null}
                    </Fact>
                    <Fact label={t('admin.auditDetail.factHttp')}>{failure.httpStatus}</Fact>
                    <Fact label={t('admin.auditDetail.factErrorName')}>{failure.name}</Fact>
                    <Fact label={t('admin.auditDetail.factStage')}>
                      {formatAuditTerm(t, 'stages', failure.stage)}
                    </Fact>
                    <Fact label={t('admin.auditDetail.factEntrypoint')}>
                      {formatAuditTerm(t, 'entrypoints', failure.entrypoint)}
                    </Fact>
                    <Fact label={t('admin.auditDetail.factProvider')}>{failure.provider}</Fact>
                  </dl>

                  {failure.origin ? (
                    <div className="audit-detail__where">
                      <h4>
                        <FileCode2 size={14} aria-hidden /> {t('admin.auditDetail.whereTitle')}
                      </h4>
                      <OriginLine origin={failure.origin} />
                    </div>
                  ) : null}

                  {failure.causes.length ? (
                    <div className="audit-detail__causes">
                      <h4>{t('admin.auditDetail.causesTitle')}</h4>
                      <ol>
                        {failure.causes.map((cause, index) => (
                          <li key={`${cause.message ?? 'cause'}-${index}`}>
                            {cause.name ? <code>{cause.name}</code> : null}
                            <span>{cause.message}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {failure.stack ? (
                    <details className="audit-detail__stack">
                      <summary>{t('admin.auditDetail.stackTitle')}</summary>
                      <pre>{failure.stack}</pre>
                    </details>
                  ) : null}
                </details>
              </section>
            ) : null}

            {/* Qué venía haciendo. El eje que antes no existía. */}
            <section className="audit-detail__block">
              <h3>
                <History size={15} aria-hidden /> {t('admin.auditDetail.contextTitle')}
              </h3>

              {context.request.length ? (
                <div className="audit-detail__axis">
                  <h4>{t('admin.auditDetail.axisRequest')}</h4>
                  <p className="audit-detail__axis-hint">
                    {t('admin.auditDetail.axisRequestHint')}
                  </p>
                  <ContextList
                    entries={context.request}
                    emptyLabel={t('admin.auditDetail.axisEmpty')}
                    labels={contextLabels}
                    currentId={event.id}
                    onOpen={setCurrentId}
                  />
                </div>
              ) : null}

              <div className="audit-detail__axis">
                <h4>{t('admin.auditDetail.axisBefore')}</h4>
                <p className="audit-detail__axis-hint">{t('admin.auditDetail.axisBeforeHint')}</p>
                <ContextList
                  entries={context.actorBefore}
                  emptyLabel={t('admin.auditDetail.axisBeforeEmpty')}
                  labels={contextLabels}
                  currentId={event.id}
                  onOpen={setCurrentId}
                />
              </div>

              {context.actorAfter.length ? (
                <div className="audit-detail__axis">
                  <h4>{t('admin.auditDetail.axisAfter')}</h4>
                  <ContextList
                    entries={context.actorAfter}
                    emptyLabel={t('admin.auditDetail.axisEmpty')}
                    labels={contextLabels}
                    currentId={event.id}
                    onOpen={setCurrentId}
                  />
                </div>
              ) : null}

              <div className="audit-detail__axis">
                <h4>{t('admin.auditDetail.axisEntity')}</h4>
                <p className="audit-detail__axis-hint">{t('admin.auditDetail.axisEntityHint')}</p>
                <ContextList
                  entries={context.entity}
                  emptyLabel={t('admin.auditDetail.axisEmpty')}
                  labels={contextLabels}
                  currentId={event.id}
                  onOpen={setCurrentId}
                />
              </div>
            </section>

            {Object.keys(residual).length ? (
              <details className="audit-detail__raw">
                <summary>{t('admin.auditDetail.rawTitle')}</summary>
                <pre>{JSON.stringify(residual, null, 2)}</pre>
              </details>
            ) : null}

            <footer className="audit-detail__footer">
              <Button variant="secondary" size="small" onClick={copyEvent}>
                <Copy size={15} aria-hidden />
                {copied ? t('admin.auditDetail.copied') : t('admin.auditDetail.copy')}
              </Button>
            </footer>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}
