import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CircleAlert,
  RefreshCw,
  Route,
} from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminSavedViews from '../../components/admin/AdminSavedViews.jsx'
import AuditEventBody from '../../components/admin/AuditEventBody.jsx'
import AuditEventDialog from '../../components/admin/AuditEventDialog.jsx'
import PaymentTraceDialog from '../../components/admin/PaymentTraceDialog.jsx'
import { AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { auditLabels } from '../../i18n/adminHelpers.js'
import es from '../../i18n/locales/es.js'
import { translate } from '../../i18n/translate.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'
import {
  fetchAuditEntries,
  fetchAuditFacets,
  fetchAuditOverview,
  isAuditIncidentEntry,
} from '../../services/auditService.js'

/** `entity_type` que `paymentAuditTrail.js` usa para órdenes de cobro: cubre
 * afiliación, combo, inscripción (`athlete_payment_order`) y entradas
 * (`ticket_order`). Es lo único que hace falta para abrir su traza completa. */
const TRACEABLE_ENTITY_TYPES = new Set(['athlete_payment_order', 'ticket_order'])

/**
 * AuditSection — PLU ARG
 *
 * La sección era un placeholder y el historial que sí se mostraba (timeline del
 * atleta, actividad reciente) se armaba en el browser sobre localStorage: uno
 * distinto por operador y perdido al limpiar el navegador. Acá se lee
 * `domain_audit_logs`, que las RPC escriben dentro de la misma transacción que
 * aplica cada efecto, así que el registro no puede divergir del hecho.
 *
 * Es solo lectura, sin acciones de fila: una auditoría que se puede editar
 * desde el panel no sirve como auditoría.
 */

const PAGE_SIZE = 100
const EMPTY_OVERVIEW = {
  status: 'unknown',
  eventsLast24h: 0,
  emailsDeliveredLast24h: 0,
  emailsRetrying: 0,
  emailAttention: 0,
  paymentAttention: 0,
  activeMembershipsWithoutConfirmation: 0,
  approvedOrdersWithoutActiveMembership: 0,
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function useMobileAuditLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const sync = (event) => setIsMobile(event.matches)
    sync(media)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isMobile
}

function AuditMobileList({
  emptyMessage,
  entries,
  labels,
  onOpenDetail,
  onOpenTrace,
  t,
}) {
  if (!entries.length) return <p className="audit-mobile-list__empty">{emptyMessage}</p>

  return (
    <div className="audit-mobile-list" aria-label={t('admin.audit.mobileListLabel')}>
      {entries.map((entry) => (
        <article className="audit-mobile-entry" key={entry.id}>
          <div className="audit-mobile-entry__head">
            <div className="audit-mobile-entry__action">
              <span
                className={`status-pill status-pill--${entry.tone === 'default' ? 'neutral' : entry.tone}`}
              >
                {labels.action(entry.action)}
              </span>
              <span>
                {[labels.source(entry.source), labels.actor(entry.actorType)]
                  .filter(Boolean)
                  .filter((label, index, list) => list.indexOf(label) === index)
                  .join(' · ')}
              </span>
            </div>
            <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
          </div>

          <dl className="audit-mobile-entry__facts">
            <div>
              <dt>{t('admin.audit.columnEntity')}</dt>
              <dd>{labels.entity(entry.entityType)}</dd>
            </div>
            {entry.actorId ? (
              <div>
                <dt>{t('admin.audit.columnActor')}</dt>
                <dd>{labels.actor(entry.actorType)}</dd>
              </div>
            ) : null}
          </dl>

          <AuditEventBody labels={labels} row={entry} />

          <footer className="audit-mobile-entry__footer">
            <button
              type="button"
              className="audit-mobile-entry__detail"
              onClick={() => onOpenDetail(entry.id)}
            >
              {t('admin.audit.openDetail')}
              <ArrowUpRight size={16} aria-hidden />
            </button>
            {TRACEABLE_ENTITY_TYPES.has(entry.entityType) && entry.entityId ? (
              <AdminIconButton
                icon={Route}
                label={t('admin.paymentTrace.open')}
                onClick={() => onOpenTrace(entry.entityId)}
                variant="ghost"
              />
            ) : null}
          </footer>
        </article>
      ))}
    </div>
  )
}

export default function AuditSection() {
  // La auditoría es una herramienta operativa para el equipo local. No debe
  // heredar un idioma guardado en otra parte del sitio: sus etiquetas explican
  // evidencia y acciones sensibles, y se presentan siempre en español.
  const t = useCallback((key, vars) => translate(es, key, vars), [])
  const isMobileLayout = useMobileAuditLayout()
  const [entries, setEntries] = useState([])
  const [facets, setFacets] = useState({
    actions: [],
    categories: [],
    entityTypes: [],
    actorTypes: [],
    sources: [],
    statuses: [],
  })
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')
  const [category, setCategory] = useState('all')
  const [actorType, setActorType] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  // Cursor compuesto { createdAt, id }: la fecha sola no desempata filas del
  // mismo instante y "Cargar más" las saltearía.
  const [cursor, setCursor] = useState(null)
  const [traceOrderId, setTraceOrderId] = useState(null)
  // Recorte del lado del cliente: no hay forma de pedirle al backend "solo
  // errores" (el tono sale de `severity` o de un mapa de acción → tono en el
  // browser, no es una columna filtrable). Se aplica sobre lo ya cargado.
  const [onlyIncidents, setOnlyIncidents] = useState(false)
  const [detailEventId, setDetailEventId] = useState(null)
  const { views: savedViews, saveView, removeView } = useAdminSavedFilterViews('audit')

  const savedViewSnapshot = useMemo(
    () => ({ query, source, status, category, action, actorType, entityType }),
    [action, actorType, category, entityType, query, source, status],
  )
  const activeSavedView = useMemo(
    () => findMatchingView(savedViews, savedViewSnapshot),
    [savedViews, savedViewSnapshot],
  )
  const hasFiltersToSave =
    query.trim() !== '' ||
    source !== 'all' ||
    status !== 'all' ||
    category !== 'all' ||
    action !== 'all' ||
    actorType !== 'all' ||
    entityType !== 'all'

  function applySavedView(view) {
    setQuery(view.snapshot.query ?? '')
    setSource(view.snapshot.source ?? 'all')
    setStatus(view.snapshot.status ?? 'all')
    setCategory(view.snapshot.category ?? 'all')
    setAction(view.snapshot.action ?? 'all')
    setActorType(view.snapshot.actorType ?? 'all')
    setEntityType(view.snapshot.entityType ?? 'all')
  }

  function clearSavedView() {
    setQuery('')
    setSource('all')
    setStatus('all')
    setCategory('all')
    setAction('all')
    setActorType('all')
    setEntityType('all')
  }

  const filters = useMemo(
    () => ({
      action: action === 'all' ? undefined : action,
      category: category === 'all' ? undefined : category,
      actorType: actorType === 'all' ? undefined : actorType,
      entityType: entityType === 'all' ? undefined : entityType,
      source: source === 'all' ? undefined : source,
      status: status === 'all' ? undefined : status,
      search: query.trim() || undefined,
      limit: PAGE_SIZE,
    }),
    [action, actorType, category, entityType, query, source, status],
  )

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchAuditEntries(filters)
      setEntries(result.entries)
      setCursor(
        result.nextCursor
          ? { createdAt: result.nextCursor, id: result.nextCursorId ?? null }
          : null,
      )
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.audit.loadError'))
    } finally {
      setLoading(false)
    }
  }, [filters, t])

  const loadOverview = useCallback(
    async (reportError = false) => {
      try {
        const nextOverview = await fetchAuditOverview()
        setOverview({ ...EMPTY_OVERVIEW, ...nextOverview })
      } catch (loadError) {
        setOverview(EMPTY_OVERVIEW)
        if (reportError) setError(loadError?.message ?? t('admin.audit.loadError'))
      }
    },
    [t],
  )

  const refresh = useCallback(async () => {
    await Promise.all([loadEntries(), loadOverview(true)])
  }, [loadEntries, loadOverview])

  useEffect(() => {
    // La búsqueda pega contra la API, no contra un array en memoria: la
    // bitácora crece sin techo y no se puede traer entera al browser.
    const timer = setTimeout(() => {
      void loadEntries()
    }, 250)
    return () => clearTimeout(timer)
  }, [loadEntries])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  useEffect(() => {
    fetchAuditFacets()
      .then((nextFacets) => setFacets((current) => ({ ...current, ...nextFacets })))
      .catch(() => {})
  }, [])

  async function loadMore() {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const result = await fetchAuditEntries({
        ...filters,
        before: cursor.createdAt,
        beforeId: cursor.id ?? undefined,
      })
      setEntries((current) => [...current, ...result.entries])
      setCursor(result.nextCursor)
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.audit.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

  // Las acciones llegan como `membership.activated`: `t()` parte la clave por
  // puntos, así que estas etiquetas se resuelven contra el diccionario. Una RPC
  // nueva que empiece a auditar aparece igual en el listado aunque todavía no
  // tenga copy, en vez de desaparecer.
  const labels = useMemo(() => auditLabels(es), [])
  const actionLabel = labels.action
  const categoryLabel = labels.category
  const actorLabel = labels.actor
  const entityLabel = labels.entity
  const sourceLabel = labels.source
  const statusLabel = labels.status

  const filterOptions = useMemo(
    () => [
      {
        id: 'source',
        label: t('admin.audit.filterSource'),
        value: source,
        onChange: setSource,
        showLabel: true,
        allLabel: t('admin.audit.filterAll'),
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.sources.map((value) => [value, sourceLabel(value)]),
        ],
      },
      {
        id: 'status',
        label: t('admin.audit.filterStatus'),
        value: status,
        onChange: setStatus,
        variant: 'select',
        showLabel: true,
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.statuses.map((value) => [value, statusLabel(value)]),
        ],
      },
      /*
        Va antes que el filtro de acción y sin `advanced`: agrupa los nombres
        que describen el mismo hecho con distinta convención
        (`payment.webhook_failed` de la app y `payment_webhook.failed` del
        trigger), así que es el filtro correcto para empezar a buscar. El de
        acción exacta queda para cuando ya se sabe qué se busca.
      */
      {
        id: 'category',
        label: t('admin.audit.filterCategory'),
        value: category,
        onChange: setCategory,
        variant: 'select',
        showLabel: true,
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.categories.map((value) => [value, categoryLabel(value)]),
        ],
      },
      {
        id: 'action',
        label: t('admin.audit.filterAction'),
        value: action,
        onChange: setAction,
        variant: 'select',
        showLabel: true,
        advanced: true,
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.actions.map((value) => [value, actionLabel(value)]),
        ],
      },
      {
        id: 'actorType',
        label: t('admin.audit.filterActor'),
        value: actorType,
        onChange: setActorType,
        variant: 'select',
        showLabel: true,
        advanced: true,
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.actorTypes.map((value) => [value, actorLabel(value)]),
        ],
      },
      {
        id: 'entityType',
        label: t('admin.audit.filterEntity'),
        value: entityType,
        onChange: setEntityType,
        variant: 'select',
        showLabel: true,
        advanced: true,
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.entityTypes.map((value) => [value, entityLabel(value)]),
        ],
      },
    ],
    [
      action,
      actionLabel,
      actorLabel,
      actorType,
      category,
      categoryLabel,
      entityLabel,
      entityType,
      facets,
      source,
      sourceLabel,
      status,
      statusLabel,
      t,
    ],
  )

  const columns = useMemo(
    () => [
      {
        key: 'createdAt',
        label: t('admin.audit.columnWhen'),
        // En mobile la hora va arriba a la derecha; la acción lidera la card.
        mobile: 'badge',
        className: 'data-table__column--audit-when',
        render: (row) => (
          <time className="audit-entry__time" dateTime={row.createdAt}>
            {formatDateTime(row.createdAt)}
          </time>
        ),
      },
      {
        key: 'action',
        label: t('admin.audit.columnAction'),
        mobile: 'primary',
        render: (row) => (
          <div className="audit-entry__action">
            <span
              className={`status-pill status-pill--${row.tone === 'default' ? 'neutral' : row.tone}`}
            >
              {actionLabel(row.action)}
            </span>
            <small>
              {[sourceLabel(row.source), row.actorType ? actorLabel(row.actorType) : null]
                .filter(Boolean)
                .filter((label, index, list) => list.indexOf(label) === index)
                .join(' · ')}
            </small>
          </div>
        ),
      },
      {
        key: 'entity',
        label: t('admin.audit.columnEntity'),
        mobile: 'hidden',
        render: (row) => (
          <div className="audit-entry__entity">
            <span className="audit-entry__entity-type">{entityLabel(row.entityType)}</span>
            <span className="audit-id-truncate" title={row.entityId}>
              <AdminMonoCell>{row.entityId}</AdminMonoCell>
            </span>
            {TRACEABLE_ENTITY_TYPES.has(row.entityType) && row.entityId ? (
              <AdminIconButton
                icon={Route}
                label={t('admin.paymentTrace.open')}
                // La fila entera abre el detalle del evento; sin esto, pedir la
                // traza de la orden abriría además el diálogo de al lado.
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation()
                  setTraceOrderId(row.entityId)
                }}
                variant="ghost"
              />
            ) : null}
          </div>
        ),
      },
      {
        key: 'actor',
        label: t('admin.audit.columnActor'),
        mobile: 'hidden',
        render: (row) => (
          <div className="audit-entry__actor">
            <span className="audit-entry__actor-type">{actorLabel(row.actorType)}</span>
            {row.actorId ? (
              <span className="audit-id-truncate" title={row.actorId}>
                <AdminMonoCell>{row.actorId}</AdminMonoCell>
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'detail',
        label: t('admin.audit.columnDetail'),
        mobile: 'default',
        className: 'data-table__column--audit-detail',
        render: (row) => <AuditEventBody labels={labels} row={row} />,
      },
    ],
    [actionLabel, actorLabel, entityLabel, labels, sourceLabel, t],
  )

  const affiliationIncidents =
    overview.activeMembershipsWithoutConfirmation + overview.approvedOrdersWithoutActiveMembership
  // Solo pagos y afiliaciones disparan semántica crítica en UI. Los emails
  // del overview siguen visibles, pero como ruido operativo (tono soft).
  const criticalCount = overview.paymentAttention + affiliationIncidents
  const emailAttentionCount = overview.emailAttention
  const displayStatus =
    overview.status === 'unknown'
      ? 'unknown'
      : criticalCount > 0
        ? 'attention'
        : emailAttentionCount > 0
          ? 'soft'
          : 'healthy'

  // “Solo errores” recorta lo ya cargado: danger + warning + estados fallidos.
  // El overview (críticas/emails) viene de otra RPC y no garantiza filas en
  // esta página — el toggle no promete ese conteo.
  const loadedErrorCount = useMemo(
    () => entries.filter(isAuditIncidentEntry).length,
    [entries],
  )
  const displayedEntries = useMemo(
    () => (onlyIncidents ? entries.filter(isAuditIncidentEntry) : entries),
    [entries, onlyIncidents],
  )

  function toggleOnlyIncidents() {
    setOnlyIncidents((current) => !current)
  }

  const auditGuide = (
    <details className="audit-flow-guide">
      <summary>
        <span>{t('admin.audit.flowEyebrow')}</span>
        <strong>{t('admin.audit.flowTitle')}</strong>
      </summary>
      <div className="audit-flow-guide__content">
        <p>{t('admin.audit.flowLead')}</p>
        <ol className="audit-flow-guide__steps">
          <li>
            <strong>{t('admin.audit.flowStepHealthTitle')}</strong>
            <span>{t('admin.audit.flowStepHealthBody')}</span>
          </li>
          <li>
            <strong>{t('admin.audit.flowStepFilterTitle')}</strong>
            <span>{t('admin.audit.flowStepFilterBody')}</span>
          </li>
          <li>
            <strong>{t('admin.audit.flowStepDetailTitle')}</strong>
            <span>{t('admin.audit.flowStepDetailBody')}</span>
          </li>
        </ol>
      </div>
    </details>
  )

  const healthPillTone =
    displayStatus === 'healthy' ? 'success' : displayStatus === 'attention' ? 'danger' : 'warning'
  const healthPillLabel =
    displayStatus === 'healthy'
      ? t('admin.audit.healthHealthy')
      : displayStatus === 'attention'
        ? t('admin.audit.healthAttention')
        : displayStatus === 'soft'
          ? t('admin.audit.healthSoftAttention')
          : t('admin.audit.healthUnknown')

  const criticalBreakdown =
    criticalCount > 0
      ? [
          overview.paymentAttention > 0
            ? `${t('admin.audit.healthBreakdownPayments')} ${overview.paymentAttention}`
            : null,
          affiliationIncidents > 0
            ? `${t('admin.audit.healthBreakdownAffiliation')} ${affiliationIncidents}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  const affiliationDetailTitle =
    affiliationIncidents > 0
      ? [
          `${t('admin.audit.healthBreakdownOrdersGap')}: ${overview.approvedOrdersWithoutActiveMembership}`,
          `${t('admin.audit.healthBreakdownMembershipEmails')}: ${overview.activeMembershipsWithoutConfirmation}`,
        ].join(' · ')
      : undefined

  const health = (
    <section
      className={`audit-health-bento audit-health--${displayStatus}`}
      aria-label={t('admin.audit.healthTitle')}
      aria-live="polite"
    >
      <div className="audit-health__strip">
        <div className="audit-health__intro">
          <h3>{t('admin.audit.healthTitle')}</h3>
          <span className={`status-pill status-pill--${healthPillTone}`}>{healthPillLabel}</span>
        </div>

        <dl className="audit-health__metrics">
          <div className="audit-health__metric">
            <dt>{t('admin.audit.healthEvents')}</dt>
            <dd>{overview.eventsLast24h}</dd>
          </div>

          <div className="audit-health__metric">
            <dt>{t('admin.audit.healthDelivered')}</dt>
            <dd>{overview.emailsDeliveredLast24h}</dd>
          </div>

          <div
            className={`audit-health__metric${criticalCount > 0 ? ' is-attention' : ''}`}
            title={affiliationDetailTitle}
          >
            <dt>{t('admin.audit.healthIncidents')}</dt>
            <dd>
              {entries.length > 0 ? (
                <button
                  type="button"
                  className="audit-health__metric-action"
                  aria-pressed={onlyIncidents}
                  onClick={toggleOnlyIncidents}
                >
                  {criticalCount}
                </button>
              ) : (
                criticalCount
              )}
            </dd>
            {criticalBreakdown ? (
              <span className="audit-health__metric-note">{criticalBreakdown}</span>
            ) : null}
          </div>

          <div className={`audit-health__metric${emailAttentionCount > 0 ? ' is-soft' : ''}`}>
            <dt>{t('admin.audit.healthEmailsAttention')}</dt>
            <dd>{emailAttentionCount}</dd>
          </div>
        </dl>
      </div>
    </section>
  )

  return (
    <AdminListSection
      variant="audit"
      filteredCount={displayedEntries.length}
      placeholder={t('admin.audit.searchPlaceholder')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.audit.eyebrow')}
      title={t('admin.audit.title')}
      subtitle={t('admin.audit.subtitle')}
      totalCount={entries.length}
      beforeFilters={
        <>
          {auditGuide}
          {health}
          <AdminSavedViews
            views={savedViews}
            activeViewId={activeSavedView?.id ?? null}
            allLabel={t('admin.savedViews.all')}
            caption={t('admin.savedViews.caption')}
            addLabel={t('admin.savedViews.add')}
            namePlaceholder={t('admin.savedViews.namePlaceholder')}
            removeAriaLabel={(label) => t('admin.savedViews.remove', { label })}
            canSave={hasFiltersToSave && !activeSavedView}
            onApply={applySavedView}
            onClear={clearSavedView}
            onSave={(label) => saveView(label, savedViewSnapshot)}
            onRemove={removeView}
          />
        </>
      }
      filters={filterOptions}
      filterActions={
        <>
          <button
            type="button"
            className={`audit-incidents-toggle${onlyIncidents ? ' is-active' : ''}`}
            aria-pressed={onlyIncidents}
            disabled={entries.length === 0}
            onClick={toggleOnlyIncidents}
          >
            <CircleAlert size={14} aria-hidden />
            {t('admin.audit.onlyIncidents')}
            {loadedErrorCount > 0 ? (
              <span className="audit-incidents-toggle__count">{loadedErrorCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} aria-hidden />
            {t('admin.audit.refresh')}
          </button>
        </>
      }
      onQueryChange={setQuery}
    >
      {error ? (
        <ErrorState
          title={t('admin.audit.loadErrorTitle')}
          message={error}
          onRetry={() => void refresh()}
        />
      ) : null}

      {loading ? (
        <LoadingState label={t('admin.audit.loading')} />
      ) : (
        <>
          {isMobileLayout ? (
            <AuditMobileList
              emptyMessage={
                onlyIncidents && entries.length > 0
                  ? t('admin.audit.onlyIncidentsEmpty')
                  : t('admin.audit.empty')
              }
              entries={displayedEntries}
              labels={labels}
              onOpenDetail={setDetailEventId}
              onOpenTrace={setTraceOrderId}
              t={t}
            />
          ) : (
            <AdminDataTable
              className="admin-data-table--audit audit-desktop-table"
              columns={columns}
              rows={displayedEntries}
              pagination={false}
              emptyMessage={
                onlyIncidents && entries.length > 0
                  ? t('admin.audit.onlyIncidentsEmpty')
                  : t('admin.audit.empty')
              }
              // Toda la fila abre el detalle: el error completo, el stack y lo que
              // la persona venía haciendo antes. La celda mostraba el mensaje y
              // nada más, y el resto había que ir a buscarlo a la base.
              onRowClick={(row) => setDetailEventId(row.id)}
            />
          )}
          {cursor ? (
            <div className="audit-loadmore">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? t('admin.audit.loadingMore') : t('admin.audit.loadMore')}
              </button>
            </div>
          ) : null}
        </>
      )}

      {detailEventId ? (
        <AuditEventDialog eventId={detailEventId} onClose={() => setDetailEventId(null)} />
      ) : null}

      {traceOrderId ? (
        <PaymentTraceDialog orderId={traceOrderId} onClose={() => setTraceOrderId(null)} />
      ) : null}
    </AdminListSection>
  )
}
