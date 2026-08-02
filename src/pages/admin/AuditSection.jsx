import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchAuditEntries, fetchAuditFacets } from '../../services/auditService.js'

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
  const { locale, t } = useI18n()
  const [entries, setEntries] = useState([])
  const [facets, setFacets] = useState({ actions: [], entityTypes: [], actorTypes: [] })
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')
  const [actorType, setActorType] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(null)

  const filters = useMemo(
    () => ({
      action: action === 'all' ? undefined : action,
      actorType: actorType === 'all' ? undefined : actorType,
      entityType: entityType === 'all' ? undefined : entityType,
      search: query.trim() || undefined,
      limit: PAGE_SIZE,
    }),
    [action, actorType, entityType, query],
  )

  const load = useCallback(async () => {
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

  useEffect(() => {
    // La búsqueda pega contra la API, no contra un array en memoria: la
    // bitácora crece sin techo y no se puede traer entera al browser.
    const timer = setTimeout(() => {
      void load()
    }, 250)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    fetchAuditFacets()
      .then(setFacets)
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

  const actionLabel = useCallback(
    (value) => {
      const key = `admin.audit.actions.${value}`
      const label = t(key)
      // Una RPC nueva que empiece a auditar aparece igual en el listado
      // aunque todavía no tenga copy, en vez de desaparecer.
      return label === key ? value : label
    },
    [t],
  )

  const actorLabel = useCallback(
    (value) => {
      const key = `admin.audit.actors.${value}`
      const label = t(key)
      return label === key ? value : label
    },
    [t],
  )

  const filterOptions = useMemo(
    () => [
      {
        id: 'action',
        label: t('admin.audit.filterAction'),
        value: action,
        onChange: setAction,
        variant: 'select',
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
        options: [
          ['all', t('admin.audit.filterAll')],
          ...facets.entityTypes.map((value) => [value, value]),
        ],
      },
    ],
    [action, actionLabel, actorLabel, actorType, entityType, facets, t],
  )

  const columns = useMemo(
    () => [
      {
        key: 'createdAt',
        label: t('admin.audit.columnWhen'),
        mobile: 'primary',
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
        mobile: 'badge',
        render: (row) => (
          <span className={`status-pill status-pill--${row.tone === 'default' ? 'neutral' : row.tone}`}>
            {actionLabel(row.action)}
          </span>
        ),
      },
      {
        key: 'entity',
        label: t('admin.audit.columnEntity'),
        mobile: 'default',
        render: (row) => (
          <div className="audit-entry__entity">
            <span className="audit-entry__entity-type">{row.entityType}</span>
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
                  <dt>{t(`admin.audit.fields.${field}`) === `admin.audit.fields.${field}` ? field : t(`admin.audit.fields.${field}`)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="data-table__mono data-table__mono--empty">—</span>
          ),
      },
    ],
    [actionLabel, actorLabel, locale, t],
  )

  return (
    <AdminListSection
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
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void load()}>
          <RefreshCw size={15} aria-hidden />
          {t('admin.audit.refresh')}
        </button>
      }
      onQueryChange={setQuery}
    >
      {error ? (
        <ErrorState
          title={t('admin.audit.loadErrorTitle')}
          message={error}
          onRetry={() => void load()}
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
