import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import '../../styles/pages/admin-audit-feed.css'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import AdminSavedViews from '../../components/admin/AdminSavedViews.jsx'
import AuditEventDialog from '../../components/admin/AuditEventDialog.jsx'
import AuditFeed from '../../components/admin/AuditFeed.jsx'
import AuditStatusBand from '../../components/admin/AuditStatusBand.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import PaymentDiagnosticsPanel from '../../components/admin/PaymentDiagnosticsPanel.jsx'
import PaymentIntegrityCallout from '../../components/admin/PaymentIntegrityCallout.jsx'
import PaymentTraceDialog from '../../components/admin/PaymentTraceDialog.jsx'
import TicketSalesAnalyticsPanel from '../../components/admin/TicketSalesAnalyticsPanel.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { auditLabels } from '../../i18n/adminHelpers.js'
import es from '../../i18n/locales/esFull.js'
import { translate } from '../../i18n/translate.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'
import {
  fetchAuditEntries,
  fetchAuditFacets,
  fetchAuditOverview,
  isAuditIncidentEntry,
} from '../../services/auditService.js'
import { getPaymentOperations } from '../../services/paymentService.js'
import { buildAuditStatusFilterOptions } from '../../lib/auditFilterHelpers.js'
import { groupAuditEntriesByDay } from '../../lib/auditFeed.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAuditTourSteps } from '../../lib/adminTourSteps.js'

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
 *
 * Orden de lectura: ¿hay algo para resolver? (franja de estado) → ¿qué pasó?
 * (línea de tiempo por día) → ¿con qué contexto? (detalle del evento).
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

function isTraceableEntry(entry) {
  return TRACEABLE_ENTITY_TYPES.has(entry.entityType) && Boolean(entry.entityId)
}

export default function AuditSection({ canEdit = false, ticketEvents = [] }) {
  // La auditoría es una herramienta operativa para el equipo local. No debe
  // heredar un idioma guardado en otra parte del sitio: sus etiquetas explican
  // evidencia y acciones sensibles, y se presentan siempre en español.
  const t = useCallback((key, vars) => translate(es, key, vars), [])
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-audit', getAuditTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

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
  // 'all' | 'incidents' (danger + warning + fallidos) | 'critical' (solo danger).
  const [severity, setSeverity] = useState('all')
  const [severityTouched, setSeverityTouched] = useState(false)
  const [detailEventId, setDetailEventId] = useState(null)
  const [paymentOps, setPaymentOps] = useState(null)
  // Bitácora / Diagnóstico de cobros / Ventas de entradas: tres lecturas de
  // "qué hizo el sistema" que antes vivían repartidas (la bitácora acá, el
  // resto adentro de Cobros). `trail` es el default porque es la evidencia
  // cruda; las otras dos son vistas derivadas sobre el mismo dominio.
  const [activeAuditTab, setActiveAuditTab] = useState('trail')
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

  const loadPaymentOps = useCallback(async () => {
    try {
      const ops = await getPaymentOperations()
      setPaymentOps(ops)
    } catch {
      // Sin `admin.payments.read` el endpoint responde 403: la bitácora
      // sigue siendo útil y este panel simplemente no aparece.
      setPaymentOps(null)
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([loadEntries(), loadOverview(true), loadPaymentOps()])
  }, [loadEntries, loadOverview, loadPaymentOps])

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
    void loadPaymentOps()
  }, [loadPaymentOps])

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
        id: 'status',
        label: t('admin.audit.filterStatus'),
        value: status,
        onChange: setStatus,
        showLabel: true,
        allLabel: t('admin.audit.filterAll'),
        options: buildAuditStatusFilterOptions(facets, statusLabel, t('admin.audit.filterAll')),
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
  const loadedErrorCount = useMemo(() => entries.filter(isAuditIncidentEntry).length, [entries])
  const loadedCriticalCount = useMemo(
    () => entries.filter((entry) => entry.tone === 'danger').length,
    [entries],
  )
  const onlyIncidents = severity !== 'all'
  const displayedEntries = useMemo(() => {
    if (severity === 'critical') return entries.filter((entry) => entry.tone === 'danger')
    if (severity === 'incidents') return entries.filter(isAuditIncidentEntry)
    return entries
  }, [entries, severity])
  const dayGroups = useMemo(() => groupAuditEntriesByDay(displayedEntries), [displayedEntries])
  const dayLabels = useMemo(
    () => ({ today: t('admin.audit.dayToday'), yesterday: t('admin.audit.dayYesterday') }),
    [t],
  )

  function chooseSeverity(next) {
    setSeverityTouched(true)
    setSeverity(next)
  }

  useEffect(() => {
    if (severityTouched || loading || entries.length === 0) return
    if (displayStatus === 'attention') {
      setSeverity('incidents')
    }
  }, [displayStatus, entries.length, loading, severityTouched])

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

  const pillTone =
    displayStatus === 'healthy' ? 'success' : displayStatus === 'attention' ? 'danger' : 'warning'
  const pillLabel =
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

  // El volumen va siempre; lo que pide acción solo aparece cuando hay algo.
  const bandMetrics = [
    { id: 'events', label: t('admin.audit.healthEvents'), value: overview.eventsLast24h },
    {
      id: 'delivered',
      label: t('admin.audit.healthDelivered'),
      value: overview.emailsDeliveredLast24h,
    },
    ...(emailAttentionCount > 0
      ? [
          {
            id: 'email-attention',
            label: t('admin.audit.healthEmailsAttention'),
            value: emailAttentionCount,
            soft: true,
          },
        ]
      : []),
  ]

  const auditTabs = [
    { id: 'trail', label: t('admin.audit.tabTrail') },
    { id: 'diagnostics', label: t('admin.audit.tabDiagnostics') },
    { id: 'sales', label: t('admin.audit.tabSales') },
  ]

  const emptyMessage =
    severity === 'critical' && entries.length > 0
      ? t('admin.audit.criticalEmpty')
      : onlyIncidents && entries.length > 0
        ? t('admin.audit.onlyIncidentsEmpty')
        : t('admin.audit.empty')

  // Severidad: pestañas del riel de la barra. Recorte del lado del cliente sobre
  // lo ya cargado (ver `displayedEntries`), por eso no viaja al backend.
  const severityFilter = {
    id: 'severity',
    surface: 'rail',
    label: t('admin.audit.severityGroup'),
    allLabel: t('admin.audit.severityAll'),
    value: severity,
    onChange: chooseSeverity,
    disabled: entries.length === 0,
    options: [
      ['all', t('admin.audit.severityAll'), entries.length],
      ['incidents', t('admin.audit.onlyIncidents'), loadedErrorCount],
      ['critical', t('admin.audit.severityCritical'), loadedCriticalCount],
    ],
  }

  return (
    <div className="audit-page">
      <AdminPageHeader
        className="audit-page__header"
        title={t('admin.audit.title')}
        subtitle={t('admin.audit.subtitle')}
      />

      <div className="audit-tabs">
        <DetailTabs
          tabs={auditTabs}
          activeTab={activeAuditTab}
          onChange={setActiveAuditTab}
          variant="editorial"
          ariaLabel={t('admin.audit.title')}
        />
        {activeAuditTab === 'trail' ? auditGuide : null}
      </div>

      <div style={{ display: activeAuditTab === 'trail' ? 'block' : 'none' }}>
        <AuditStatusBand
          breakdown={criticalBreakdown}
          criticalCount={criticalCount}
          detailTitle={affiliationDetailTitle}
          displayStatus={displayStatus}
          emailAttentionCount={emailAttentionCount}
          metrics={bandMetrics}
          pillLabel={pillLabel}
          pillTone={pillTone}
          t={t}
        />
        <PaymentIntegrityCallout
          health={paymentOps?.summary?.health}
          blockers={Array.isArray(paymentOps?.blockers) ? paymentOps.blockers : []}
          t={t}
          onOpenPayments={() => setActiveAuditTab('diagnostics')}
        />
        <AdminListSection
          variant="audit"
          filteredCount={displayedEntries.length}
          placeholder={t('admin.audit.searchPlaceholder')}
          query={query}
          showHeader={false}
          showStats={false}
          totalCount={entries.length}
          filterLayout="toolbar"
          beforeFilters={
            <>
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
          filters={[severityFilter, ...filterOptions]}
          filterActions={
            <>
              <AdminIconButton
                icon={RefreshCw}
                label={t('admin.audit.refresh')}
                onClick={() => void refresh()}
                variant="ghost"
              />
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
              {dayGroups.length === 0 ? (
                <p className="audit-feed__empty">{emptyMessage}</p>
              ) : (
                <AuditFeed
                  dayLabels={dayLabels}
                  groups={dayGroups}
                  isTraceable={isTraceableEntry}
                  labels={labels}
                  onOpenDetail={setDetailEventId}
                  onOpenTrace={setTraceOrderId}
                  t={t}
                />
              )}
              {cursor ? (
                <div className="audit-loadmore">
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
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
      </div>

      {activeAuditTab === 'diagnostics' ? (
        <PaymentDiagnosticsPanel canEdit={canEdit} t={t} />
      ) : null}

      {activeAuditTab === 'sales' ? <TicketSalesAnalyticsPanel events={ticketEvents} /> : null}
    </div>
  )
}
