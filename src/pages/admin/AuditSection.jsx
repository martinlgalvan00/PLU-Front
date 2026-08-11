import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BadgeCheck, CircleAlert, MailCheck, RefreshCw } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { auditLabels } from '../../i18n/adminHelpers.js'
import {
  fetchAuditEntries,
  fetchAuditFacets,
  fetchAuditOverview,
} from '../../services/auditService.js'

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

function formatDateTime(value, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

export default function AuditSection() {
  const { locale, messages, t } = useI18n()
  const [entries, setEntries] = useState([])
  const [facets, setFacets] = useState({
    actions: [],
    entityTypes: [],
    actorTypes: [],
    sources: [],
    statuses: [],
  })
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')
  const [actorType, setActorType] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(null)

  const filters = useMemo(
    () => ({
      action: action === 'all' ? undefined : action,
      actorType: actorType === 'all' ? undefined : actorType,
      entityType: entityType === 'all' ? undefined : entityType,
      source: source === 'all' ? undefined : source,
      status: status === 'all' ? undefined : status,
      search: query.trim() || undefined,
      limit: PAGE_SIZE,
    }),
    [action, actorType, entityType, query, source, status],
  )

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchAuditEntries(filters)
      setEntries(result.entries)
      setCursor(result.nextCursor)
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.audit.loadError'))
    } finally {
      setLoading(false)
    }
  }, [filters, t])

  const loadOverview = useCallback(async (reportError = false) => {
    try {
      const nextOverview = await fetchAuditOverview()
      setOverview({ ...EMPTY_OVERVIEW, ...nextOverview })
    } catch (loadError) {
      setOverview(EMPTY_OVERVIEW)
      if (reportError) setError(loadError?.message ?? t('admin.audit.loadError'))
    }
  }, [t])

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
      const result = await fetchAuditEntries({ ...filters, before: cursor })
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
  const labels = useMemo(() => auditLabels(messages), [messages])
  const actionLabel = labels.action
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
        variant: 'select',
        showLabel: true,
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
      {
        id: 'action',
        label: t('admin.audit.filterAction'),
        value: action,
        onChange: setAction,
        variant: 'select',
        showLabel: true,
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
            {formatDateTime(row.createdAt, locale)}
          </time>
        ),
      },
      {
        key: 'action',
        label: t('admin.audit.columnAction'),
        mobile: 'primary',
        render: (row) => (
          <div className="audit-entry__action">
            <span className={`status-pill status-pill--${row.tone === 'default' ? 'neutral' : row.tone}`}>
              {actionLabel(row.action)}
            </span>
            <small>{sourceLabel(row.source)}</small>
          </div>
        ),
      },
      {
        key: 'entity',
        label: t('admin.audit.columnEntity'),
        mobile: 'default',
        render: (row) => (
          <div className="audit-entry__entity">
            <span className="audit-entry__entity-type">{entityLabel(row.entityType)}</span>
            <AdminMonoCell>{row.entityId}</AdminMonoCell>
          </div>
        ),
      },
      {
        key: 'actor',
        label: t('admin.audit.columnActor'),
        mobile: 'default',
        render: (row) => (
          <div className="audit-entry__actor">
            <span className="audit-entry__actor-type">{actorLabel(row.actorType)}</span>
            {row.actorId ? <AdminMonoCell>{row.actorId}</AdminMonoCell> : null}
          </div>
        ),
      },
      {
        key: 'detail',
        label: t('admin.audit.columnDetail'),
        mobile: 'default',
        render: (row) =>
          row.summary.length > 0 ? (
            <dl className="audit-entry__detail">
              {row.summary.map(({ field, value }) => (
                <div key={field}>
                  <dt>{labels.field(field)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="data-table__mono data-table__mono--empty">—</span>
          ),
      },
    ],
    [actionLabel, actorLabel, entityLabel, labels, locale, sourceLabel, t],
  )

  const affiliationIncidents =
    overview.activeMembershipsWithoutConfirmation + overview.approvedOrdersWithoutActiveMembership
  const attentionCount = overview.emailAttention + overview.paymentAttention + affiliationIncidents

  return (
    <AdminListSection
      variant="audit"
      filteredCount={entries.length}
      placeholder={t('admin.audit.searchPlaceholder')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.audit.eyebrow')}
      title={t('admin.audit.title')}
      subtitle={t('admin.audit.subtitle')}
      totalCount={entries.length}
      filters={filterOptions}
      filterActions={
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void refresh()}>
          <RefreshCw size={15} aria-hidden />
          {t('admin.audit.refresh')}
        </button>
      }
      onQueryChange={setQuery}
    >
      <section
        className={`audit-health audit-health--${overview.status}`}
        aria-label={t('admin.audit.healthTitle')}
        aria-live="polite"
      >
        <header className="audit-health__header">
          <div>
            <span className="audit-health__eyebrow">{t('admin.audit.healthEyebrow')}</span>
            <h3>{t('admin.audit.healthTitle')}</h3>
          </div>
          <span className={`status-pill status-pill--${
            overview.status === 'healthy' ? 'success' : overview.status === 'attention' ? 'danger' : 'warning'
          }`}>
            {overview.status === 'healthy'
              ? t('admin.audit.healthHealthy')
              : overview.status === 'attention'
                ? t('admin.audit.healthAttention')
                : t('admin.audit.healthUnknown')}
          </span>
        </header>

        <dl className="audit-health__metrics">
          <div>
            <Activity size={17} aria-hidden />
            <dt>{t('admin.audit.healthEvents')}</dt>
            <dd>{overview.eventsLast24h}</dd>
          </div>
          <div>
            <MailCheck size={17} aria-hidden />
            <dt>{t('admin.audit.healthDelivered')}</dt>
            <dd>{overview.emailsDeliveredLast24h}</dd>
          </div>
          <div>
            <RefreshCw size={17} aria-hidden />
            <dt>{t('admin.audit.healthRetrying')}</dt>
            <dd>{overview.emailsRetrying}</dd>
          </div>
          <div className={attentionCount > 0 ? 'is-attention' : ''}>
            {attentionCount > 0 ? <CircleAlert size={17} aria-hidden /> : <BadgeCheck size={17} aria-hidden />}
            <dt>{t('admin.audit.healthIncidents')}</dt>
            <dd>{attentionCount}</dd>
          </div>
        </dl>

        {affiliationIncidents > 0 ? (
          <p className="audit-health__notice">
            {t('admin.audit.healthMembershipNotice', {
              orders: overview.approvedOrdersWithoutActiveMembership,
              emails: overview.activeMembershipsWithoutConfirmation,
            })}
          </p>
        ) : null}
      </section>

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
          <AdminDataTable
            className="admin-data-table--audit"
            columns={columns}
            rows={entries}
            emptyMessage={t('admin.audit.empty')}
          />
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
    </AdminListSection>
  )
}
