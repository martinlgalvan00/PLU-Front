import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CircleAlert,
  Flame,
  LogIn,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserSearch,
  Users,
} from 'lucide-react'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import AnalyticsStatTile from '../../components/admin/AnalyticsStatTile.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import LivePresenceBar from '../../components/admin/LivePresenceBar.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatAnalyticsPath } from '../../lib/analyticsPathLabels.js'
import {
  fetchAccessMetrics,
  fetchAnalyticsElements,
  fetchAnalyticsFlows,
  fetchAnalyticsFunnel,
  fetchAnalyticsHeatmap,
  fetchAnalyticsOverview,
  fetchAnalyticsOperationalSummary,
  fetchAnalyticsOperationalAlerts,
  fetchAnalyticsPages,
  fetchAthleteJourney,
  withFunnelRates,
} from '../../services/analyticsReportService.js'
import { getPaymentFailureReasons } from '../../services/paymentService.js'

/**
 * AnalyticsSection — PLU ARG
 *
 * Informe de uso del sitio: cuanta gente entra, por donde navega, donde clickea
 * y donde abandona el embudo de afiliacion.
 *
 * Es la contracara de `AuditSection`. Aquella responde "que hizo el sistema"
 * (cobros, activaciones, credenciales) y es la evidencia ante un reclamo; esta
 * responde "que hizo la gente" y orienta decisiones de producto. Viven en
 * secciones distintas porque mezclarlas volveria ilegibles a las dos.
 *
 * Solo lectura y agregado: el detalle crudo tiene identidad vinculada al
 * atleta y no baja al navegador.
 */

const RANGES = [7, 30, 90]
const HEATMAP_GRID = 40
const TABS = {
  overview: 'overview',
  pages: 'pages',
  usage: 'usage',
  athlete: 'athlete',
}

/**
 * Un mapa de calor que mezcla mobile y desktop promedia dos documentos de alto
 * distinto: el mismo 0.5 vertical cae en secciones diferentes. Poder separarlos
 * es lo que hace el mapa accionable en vez de solo vistoso.
 */
const HEATMAP_DEVICES = ['', 'desktop', 'mobile', 'tablet']

/**
 * Etiquetas de los pasos del embudo. El backend devuelve el nombre tecnico del
 * evento (`payment_approved`); si algun dia emite uno que todavia no se tradujo,
 * `translate` devolveria la clave completa como texto. Por eso el fallback es
 * explicito y muestra el nombre crudo, que al menos es legible.
 */
const FUNNEL_LABELS = {
  landing_view: 'admin.analytics.funnelSteps.landingView',
  membership_view: 'admin.analytics.funnelSteps.membershipView',
  membership_checkout_opened: 'admin.analytics.funnelSteps.checkoutOpened',
  // Calificados por flujo: el `payment_submitted` a secas lo emiten tambien
  // inscripcion y entradas, y mezclarlos rompia la cadena del embudo.
  membership_payment_submitted: 'admin.analytics.funnelSteps.paymentSubmitted',
  membership_payment_approved: 'admin.analytics.funnelSteps.paymentApproved',
}

function funnelLabel(stepName, t) {
  const key = FUNNEL_LABELS[stepName]
  if (!key) return stepName
  const label = t(key)
  return label === key ? stepName : label
}

function percent(value, locale) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

function count(value, locale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0))
}

/**
 * Rango inmediatamente anterior al actual, de igual longitud. `days` no
 * alcanza para pedirlo directo (el backend lo resuelve siempre contra "ahora"),
 * así que acá se arma el `from`/`to` explícito del tramo previo.
 */
function previousRange(days) {
  const now = Date.now()
  const spanMs = days * 24 * 60 * 60 * 1000
  return {
    from: new Date(now - spanMs * 2).toISOString(),
    to: new Date(now - spanMs).toISOString(),
  }
}

function currentRange(days) {
  const now = Date.now()
  return {
    from: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now).toISOString(),
  }
}

/** Un bloque opcional no debería tumbar el informe entero. */
async function fetchOptional(promise, fallback) {
  try {
    return await promise
  } catch {
    return fallback
  }
}

function hasAccessMetrics(access) {
  if (!access) return false
  return (
    Number(access.succeeded?.events ?? 0) > 0 ||
    Number(access.failed?.events ?? 0) > 0 ||
    Number(access.accountsCreated ?? 0) > 0 ||
    (access.failureReasons?.length ?? 0) > 0
  )
}

function translateAccessReason(reason, t) {
  const key = `admin.analytics.access.reasons.${reason}`
  const label = t(key)
  return label === key ? String(reason ?? '').replace(/_/g, ' ') : label
}

const FAILURE_SEVERITY_TONE = { blocker: 'danger', degraded: 'warning', expected: 'neutral' }

/** `null` sin base de comparación (período anterior en cero o sin dato). */
function percentChange(current, previous) {
  const prev = Number(previous ?? 0)
  if (!(prev > 0)) return null
  return (Number(current ?? 0) - prev) / prev
}

function percentChangeLabel(value, locale) {
  if (value === null) return null
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(value)
}

/** Variación contra el período anterior, al lado del número absoluto. */
function MetricDelta({ current, previous, locale, t }) {
  const change = percentChange(current, previous)
  if (change === null) return null
  const label = percentChangeLabel(change, locale)
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const absolute = Number(current ?? 0) - Number(previous ?? 0)
  const absoluteLabel = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(absolute)
  const previousLabel = count(previous, locale)
  const currentLabel = count(current, locale)

  return (
    <span className="admin-analytics__stat-delta-wrap">
      <span
        className={`admin-analytics__stat-delta admin-analytics__stat-delta--${direction}`}
        title={t('admin.analytics.metricsDeltaDetail', {
          previous: previousLabel,
          current: currentLabel,
        })}
        aria-label={t('admin.analytics.metricsDeltaAriaRich', {
          value: label,
          absolute: absoluteLabel,
          previous: previousLabel,
          current: currentLabel,
        })}
      >
        {label}
        <span className="admin-analytics__stat-delta-abs"> ({absoluteLabel})</span>
      </span>
    </span>
  )
}

function metricDeltaNode(current, previous, locale, t) {
  if (percentChange(current, previous) === null) return null
  return <MetricDelta current={current} previous={previous} locale={locale} t={t} />
}

function RelativeBarList({ items, getKey, getLabel, getWeight, renderValue, mono = false }) {
  if (!items?.length) return null
  const max = Math.max(...items.map((item) => Number(getWeight(item) ?? 0)), 1)

  return (
    <ul className="admin-analytics__bar-list">
      {items.map((item) => {
        const weight = Number(getWeight(item) ?? 0)
        return (
          <li key={getKey(item)}>
            <div className="admin-analytics__bar-list-head">
              <span
                className={`admin-analytics__bar-list-label${mono ? ' admin-analytics__bar-list-label--mono' : ''}`}
              >
                {getLabel(item)}
              </span>
              <strong className="admin-analytics__bar-list-value">{renderValue(item)}</strong>
            </div>
            <div className="admin-analytics__bar-list-track" aria-hidden>
              <span
                className="admin-analytics__bar-list-fill"
                style={{ '--bar-fill': weight / max }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function AnalyticsInsightStrip({ overview, locale, t }) {
  const hasActiveTime = Boolean(overview?.avgActiveSeconds)

  return (
    <div className="admin-analytics__insight">
      <div className="admin-analytics__insight-highlights">
        <div className="admin-analytics__insight-item">
          <p className="admin-analytics__insight-value">{count(overview?.sessions, locale)}</p>
          <p className="admin-analytics__insight-label">
            {t('admin.analytics.summaryHighlightSessions')}
          </p>
        </div>
        <div className="admin-analytics__insight-item">
          <p className="admin-analytics__insight-value">
            {hasActiveTime
              ? duration(overview.avgActiveSeconds)
              : duration(overview?.avgDurationSeconds)}
          </p>
          <p className="admin-analytics__insight-label">
            {hasActiveTime
              ? t('admin.analytics.summaryHighlightActiveTime')
              : t('admin.analytics.summaryHighlightDuration')}
          </p>
        </div>
        <div className="admin-analytics__insight-item">
          <p className="admin-analytics__insight-value">{count(overview?.interactions, locale)}</p>
          <p className="admin-analytics__insight-label">
            {t('admin.analytics.summaryHighlightInteractions')}
          </p>
        </div>
      </div>
      {!hasActiveTime ? (
        <p className="admin-analytics__insight-note admin-analytics__summary">
          {t('admin.analytics.summaryFootnoteNoActiveTime')}
        </p>
      ) : (
        <p className="admin-analytics__insight-note admin-analytics__summary">
          {t('admin.analytics.summaryFootnoteActiveTime', {
            duration: duration(overview?.avgDurationSeconds),
          })}
        </p>
      )}
    </div>
  )
}

function AnalyticsBlockHead({ id, icon: Icon, title, subtitle }) {
  return (
    <header className="admin-analytics__block-head">
      <h3 id={id}>
        <Icon size={16} aria-hidden /> {title}
      </h3>
      {subtitle ? <p className="admin-analytics__block-subtitle">{subtitle}</p> : null}
    </header>
  )
}

function PageRankingList({ pages, locale, t, selectedPath, onSelect }) {
  if (!pages?.length) {
    return <p className="admin-analytics__empty">{t('admin.analytics.pagesEmpty')}</p>
  }

  const maxPageviews = Math.max(...pages.map((page) => Number(page.pageviews ?? 0)), 1)

  return (
    <ol className="admin-analytics__page-ranking">
      {pages.map((page, index) => {
        const pathMeta = formatAnalyticsPath(page.path, t)
        const isSelected = page.path === selectedPath
        return (
          <li key={page.path}>
            <button
              type="button"
              className={`admin-analytics__page-rank${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(page.path)}
              aria-pressed={isSelected}
            >
              <span className="admin-analytics__page-rank-index" aria-hidden>
                {index + 1}
              </span>
              <span className="admin-analytics__page-rank-body">
                <span className="admin-analytics__page-rank-head">
                  <strong>{pathMeta.label}</strong>
                  {!pathMeta.mono ? (
                    <code className="admin-analytics__page-rank-path">{page.path}</code>
                  ) : null}
                </span>
                <span className="admin-analytics__page-rank-metrics">
                  <span>
                    {count(page.pageviews, locale)} {t('admin.analytics.columns.pageviews')}
                  </span>
                  <span>
                    {count(page.visitors, locale)} {t('admin.analytics.columns.visitors')}
                  </span>
                  <span>
                    {count(page.clicks, locale)} {t('admin.analytics.columns.clicks')}
                  </span>
                </span>
                <span className="admin-analytics__page-rank-track" aria-hidden>
                  <span
                    className="admin-analytics__page-rank-fill"
                    style={{ '--bar-fill': Number(page.pageviews ?? 0) / maxPageviews }}
                  />
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function duration(seconds) {
  const total = Number(seconds ?? 0)
  if (total <= 0) return '0s'
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

/**
 * Mapa de calor en SVG. Solo se dibujan las celdas con clicks —la grilla es de
 * 40x40, y pintar las 1600 siempre agregaria ~1500 nodos vacios al DOM.
 *
 * La intensidad se reparte por raiz cuadrada y no de forma lineal: un solo
 * punto muy caliente aplanaba todo el resto contra el fondo y el mapa dejaba de
 * mostrar los focos secundarios.
 *
 * La caja toma la proporcion real del documento (`aspectRatio` = alto/ancho,
 * mediana de los clicks del periodo). Antes se dibujaba una grilla cuadrada con
 * `preserveAspectRatio="none"`: como las coordenadas se normalizan sobre un
 * documento que suele medir cuatro veces mas alto que ancho, el mapa comprimia
 * todo el largo de la pagina en un cuadrado y los focos no caian donde la gente
 * habia clickeado. Sin dimensiones guardadas (datos viejos) se cae a 1:1 y se
 * avisa en el pie en vez de fingir una forma.
 */
function Heatmap({ data, locale, t }) {
  const cells = data?.cells ?? []
  const max = Number(data?.max ?? 0)
  const ratio = Number(data?.aspectRatio ?? 0)
  const hasRatio = Number.isFinite(ratio) && ratio > 0
  // Techo de 6: mas alto que eso el mapa se vuelve una tira ilegible dentro del
  // panel, y el detalle fino ya lo da la lista de elementos.
  const boxRatio = hasRatio ? Math.min(6, Math.max(0.2, ratio)) : 1

  if (!cells.length) {
    return <p className="admin-analytics__empty">{t('admin.analytics.heatmapEmpty')}</p>
  }

  return (
    <figure className="admin-analytics__heatmap">
      <svg
        viewBox={`0 0 ${HEATMAP_GRID} ${HEATMAP_GRID * boxRatio}`}
        preserveAspectRatio="xMidYMin meet"
        role="img"
        aria-label={t('admin.analytics.heatmapAlt', { path: data.path })}
      >
        {cells.map((cell) => {
          const intensity = max > 0 ? Math.sqrt(cell.weight / max) : 0
          return (
            <rect
              key={`${cell.cell_x}-${cell.cell_y}`}
              x={cell.cell_x}
              y={cell.cell_y * boxRatio}
              width="1"
              height={boxRatio}
              fill="currentColor"
              opacity={Math.max(0.08, intensity)}
            />
          )
        })}
      </svg>
      <figcaption>
        {t('admin.analytics.heatmapCaption', {
          clicks: count(data.total, locale),
          path: data.path,
        })}
        {hasRatio ? null : ` · ${t('admin.analytics.heatmapNoRatio')}`}
      </figcaption>
    </figure>
  )
}

/**
 * Recorrido de un atleta puntual: por donde paso y que toco.
 *
 * Es la unica parte del informe que muestra a una persona identificada, asi que
 * se comporta distinto al resto: no carga sola (hay que elegir a alguien),
 * avisa en pantalla que la consulta queda registrada, y solo se monta si el
 * backend va a aceptar el pedido (`admin.analytics.identity`).
 */
function AthleteJourney({ athletes, days, locale, t }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [journey, setJourney] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []
    return athletes
      .filter((athlete) => {
        const name = String(athlete.fullName ?? '').toLowerCase()
        const document = String(athlete.documentId ?? '').toLowerCase()
        return name.includes(term) || document.includes(term)
      })
      .slice(0, 6)
  }, [athletes, query])

  // El click solo elige a la persona; la carga la maneja el efecto de abajo.
  // Así cambiar el rango con alguien ya elegido refresca el recorrido sin
  // duplicar el pedido, y el efecto no necesita dependencias mentidas.
  const select = useCallback((athlete) => {
    setSelected(athlete)
    setQuery('')
  }, [])

  useEffect(() => {
    if (!selected) return undefined

    let cancelled = false
    setLoading(true)
    setError('')

    fetchAthleteJourney(selected.id, { days, limit: 25 })
      .then((result) => {
        if (!cancelled) setJourney(result)
      })
      .catch((journeyError) => {
        if (cancelled) return
        setJourney(null)
        setError(journeyError?.message ?? t('admin.analytics.journeyError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [days, selected, t])

  const summary = journey?.summary ?? null

  return (
    <section className="admin-analytics__block" aria-labelledby="analytics-journey">
      <AnalyticsBlockHead
        id="analytics-journey"
        icon={UserSearch}
        title={t('admin.analytics.journeyTitle')}
        subtitle={t('admin.analytics.journeySubtitle')}
      />

      <p className="admin-analytics__notice" role="note">
        <ShieldAlert size={14} aria-hidden />
        {t('admin.analytics.journeyAuditNotice')}
      </p>

      <label className="admin-analytics__journey-search">
        <span className="admin-analytics__journey-search-label">
          {t('admin.analytics.journeySearchLabel')}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('admin.analytics.journeySearchPlaceholder')}
          autoComplete="off"
        />
      </label>

      {matches.length ? (
        <ul className="admin-analytics__journey-matches">
          {matches.map((athlete) => (
            <li key={athlete.id}>
              <button type="button" onClick={() => select(athlete)}>
                <strong>{athlete.fullName}</strong>
                <span>{athlete.documentId}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? <LoadingState label={t('admin.analytics.journeyLoading')} /> : null}
      {error ? <p className="admin-analytics__empty">{error}</p> : null}

      {!loading && !error && selected && summary ? (
        <div className="admin-analytics__journey">
          <header className="admin-analytics__journey-profile">
            <div>
              <strong>{selected.fullName}</strong>
              <span>{selected.documentId}</span>
            </div>
          </header>

          <div className="admin-analytics__stat-grid admin-analytics__stat-grid--secondary">
            <AnalyticsStatTile
              compact
              label={t('admin.analytics.journeyMetricSessions')}
              value={summary.sessions ?? 0}
            />
            <AnalyticsStatTile
              compact
              label={t('admin.analytics.journeyMetricPageviews')}
              value={summary.pageviews ?? 0}
            />
            <AnalyticsStatTile
              compact
              label={t('admin.analytics.journeyMetricClicks')}
              value={summary.clicks ?? 0}
            />
          </div>

          {summary.pageviews === 0 && summary.clicks === 0 ? (
            <p className="admin-analytics__empty">{t('admin.analytics.journeyEmpty')}</p>
          ) : (
            <div className="admin-analytics__journey-grid">
              <div>
                <h4>{t('admin.analytics.journeyPages')}</h4>
                {(journey.pages ?? []).length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.journeyPagesEmpty')}</p>
                ) : (
                  <RelativeBarList
                    items={journey.pages}
                    getKey={(page) => page.path}
                    getLabel={(page) => formatAnalyticsPath(page.path, t).label}
                    getWeight={(page) => page.pageviews}
                    renderValue={(page) =>
                      t('admin.analytics.journeyPageviews', {
                        count: count(page.pageviews, locale),
                      })
                    }
                  />
                )}
              </div>
              <div>
                <h4>{t('admin.analytics.journeyElements')}</h4>
                {(journey.elements ?? []).length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.journeyElementsEmpty')}</p>
                ) : (
                  <RelativeBarList
                    items={journey.elements}
                    getKey={(element) => element.element_selector}
                    getLabel={(element) => element.label || element.element_selector}
                    getWeight={(element) => element.clicks}
                    renderValue={(element) =>
                      t('admin.analytics.journeyElementClicks', {
                        count: count(element.clicks, locale),
                      })
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ) : !loading && !error && selected && !summary ? (
        <p className="admin-analytics__empty">{t('admin.analytics.journeyEmpty')}</p>
      ) : !loading && !error && !selected ? (
        <p className="admin-analytics__empty admin-analytics__journey-idle">
          {t('admin.analytics.journeyIdle')}
        </p>
      ) : null}
    </section>
  )
}

export default function AnalyticsSection({
  athletes = [],
  canViewIdentity = false,
  canViewPaymentFailures = false,
  onNavigate,
}) {
  const { locale, t } = useI18n()
  const [days, setDays] = useState(30)
  const [activeTab, setActiveTab] = useState(TABS.overview)
  const [overview, setOverview] = useState(null)
  const [previousOverview, setPreviousOverview] = useState(null)
  const [pages, setPages] = useState([])
  const [flows, setFlows] = useState([])
  const [funnel, setFunnel] = useState([])
  const [elements, setElements] = useState([])
  const [access, setAccess] = useState(null)
  const [operational, setOperational] = useState(null)
  const [operationalAlerts, setOperationalAlerts] = useState([])
  const [failureReasons, setFailureReasons] = useState([])
  const [heatmapPath, setHeatmapPath] = useState(null)
  const [heatmapDevice, setHeatmapDevice] = useState('')
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [usageLoaded, setUsageLoaded] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState('')
  const [heatmapError, setHeatmapError] = useState('')
  const overviewRef = useRef(null)

  useEffect(() => {
    overviewRef.current = overview
  }, [overview])

  const load = useCallback(async () => {
    const isInitial = !overviewRef.current
    if (isInitial) {
      setLoading(true)
      setError('')
    }
    setRefreshError('')
    setUsageLoaded(false)
    setUsageError('')
    setHeatmapError('')
    try {
      let overviewResult
      try {
        overviewResult = await fetchAnalyticsOverview({ days })
      } catch (overviewError) {
        if (overviewRef.current) {
          setRefreshError(overviewError?.message ?? t('admin.analytics.refreshError'))
          return
        }
        throw overviewError
      }

      const [
        previousOverviewResult,
        pagesResult,
        funnelResult,
        accessResult,
        operationalResult,
        alertsResult,
        failureReasonsResult,
      ] = await Promise.all([
        fetchOptional(fetchAnalyticsOverview(previousRange(days)), null),
        fetchOptional(fetchAnalyticsPages({ days, limit: 25 }), []),
        fetchOptional(fetchAnalyticsFunnel({ days }), []),
        fetchOptional(fetchAccessMetrics({ days }), null),
        fetchOptional(fetchAnalyticsOperationalSummary({ days }), null),
        fetchOptional(fetchAnalyticsOperationalAlerts(), []),
        canViewPaymentFailures
          ? fetchOptional(getPaymentFailureReasons(currentRange(days)), [])
          : Promise.resolve([]),
      ])
      setOverview(overviewResult)
      setPreviousOverview(previousOverviewResult)
      setPages(pagesResult)
      setFunnel(withFunnelRates(funnelResult))
      setAccess(accessResult)
      setOperational(operationalResult)
      setOperationalAlerts(alertsResult)
      setFailureReasons(failureReasonsResult)
      setHeatmapPath((current) => current ?? pagesResult[0]?.path ?? null)
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.analytics.error'))
    } finally {
      setLoading(false)
    }
  }, [canViewPaymentFailures, days, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (activeTab !== TABS.usage || usageLoaded) return undefined

    let cancelled = false
    setUsageLoading(true)
    setUsageError('')

    Promise.all([
      fetchAnalyticsFlows({ days, limit: 20 }),
      fetchAnalyticsElements({ days, limit: 25 }),
    ])
      .then(([flowsResult, elementsResult]) => {
        if (cancelled) return
        setFlows(flowsResult)
        setElements(elementsResult)
        setUsageLoaded(true)
      })
      .catch((usageLoadError) => {
        if (cancelled) return
        setUsageError(usageLoadError?.message ?? t('admin.analytics.usageError'))
        setFlows([])
        setElements([])
        setUsageLoaded(true)
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, days, t, usageLoaded])

  useEffect(() => {
    if (!heatmapPath || activeTab !== TABS.pages) return undefined
    let cancelled = false
    setHeatmapError('')
    fetchAnalyticsHeatmap({ days, path: heatmapPath, deviceType: heatmapDevice || undefined })
      .then((result) => {
        if (!cancelled) setHeatmap(result)
      })
      .catch((heatmapLoadError) => {
        if (!cancelled) {
          setHeatmap(null)
          setHeatmapError(heatmapLoadError?.message ?? t('admin.analytics.heatmapError'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, days, heatmapDevice, heatmapPath, t])

  const tabs = useMemo(() => {
    const items = [
      { id: TABS.overview, label: t('admin.analytics.tabs.overview') },
      { id: TABS.pages, label: t('admin.analytics.tabs.pages') },
      { id: TABS.usage, label: t('admin.analytics.tabs.usage') },
    ]
    if (canViewIdentity) {
      items.push({ id: TABS.athlete, label: t('admin.analytics.tabs.athlete') })
    }
    return items
  }, [canViewIdentity, t])

  if (loading && !overview) return <LoadingState label={t('admin.analytics.loading')} />
  if (error && !overview) return <ErrorState message={error} onRetry={load} />

  return (
    <section className="admin-analytics">
      <AdminPageHeader
        className="admin-analytics__page-header"
        compact
        eyebrow={t('admin.analytics.eyebrow')}
        title={t('admin.analytics.title')}
        subtitle={t('admin.analytics.subtitle')}
        actions={
          <div className="admin-analytics__controls">
            <div
              className="admin-analytics__ranges"
              role="group"
              aria-label={t('admin.analytics.rangeLabel')}
            >
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  className={range === days ? 'is-active' : ''}
                  aria-label={t('admin.analytics.rangeDays', { days: range })}
                  aria-pressed={range === days}
                  onClick={() => setDays(range)}
                >
                  <span className="admin-analytics__range-long">
                    {t('admin.analytics.rangeDays', { days: range })}
                  </span>
                  <span className="admin-analytics__range-short" aria-hidden>
                    {t('admin.analytics.rangeDaysShort', { days: range })}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--small btn--outline"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden /> {t('admin.analytics.refresh')}
            </button>
          </div>
        }
      />

      {refreshError ? (
        <p className="admin-analytics__refresh-error" role="status">
          {refreshError}
        </p>
      ) : null}

      {/*
        Arriba del pulso historico y no en una pestaña propia: cuando hay un
        evento en curso, "ahora" manda sobre "los ultimos 30 dias". Se refresca
        sola y no depende de `load`, asi que el boton Actualizar no la toca.
      */}
      <LivePresenceBar />

      <section className="admin-analytics__pulse" aria-label={t('admin.analytics.metricsAria')}>
        <div className="admin-analytics__stat-grid">
          <AnalyticsStatTile
            label={t('admin.analytics.metrics.visitors')}
            value={overview?.visitors ?? 0}
            tone="celeste"
            delta={metricDeltaNode(
              overview?.visitors,
              previousOverview?.visitors,
              locale,
              t,
            )}
          />
          <AnalyticsStatTile
            label={t('admin.analytics.metrics.pageviews')}
            value={overview?.pageviews ?? 0}
            delta={metricDeltaNode(
              overview?.pageviews,
              previousOverview?.pageviews,
              locale,
              t,
            )}
          />
          <AnalyticsStatTile
            label={t('admin.analytics.metrics.identified')}
            value={overview?.identifiedVisitors ?? 0}
            delta={metricDeltaNode(
              overview?.identifiedVisitors,
              previousOverview?.identifiedVisitors,
              locale,
              t,
            )}
          />
          <AnalyticsStatTile
            label={t('admin.analytics.metrics.engaged')}
            value={overview?.engagedSessions ?? 0}
            hint={t('admin.analytics.metricsEngagedHint', {
              rate: percent(overview?.engagementRate, locale),
            })}
            delta={metricDeltaNode(
              overview?.engagedSessions,
              previousOverview?.engagedSessions,
              locale,
              t,
            )}
          />
        </div>

        <p className="admin-analytics__comparison-note">
          {t('admin.analytics.metricsComparisonNote', { days })}
        </p>

        <div className="admin-analytics__stat-grid admin-analytics__stat-grid--secondary">
          <AnalyticsStatTile
            compact
            label={t('admin.analytics.metrics.sessions')}
            value={overview?.sessions ?? 0}
          />
          <AnalyticsStatTile
            compact
            label={t('admin.analytics.metrics.duration')}
            value={duration(overview?.avgDurationSeconds)}
          />
          <AnalyticsStatTile
            compact
            label={t('admin.analytics.metrics.interactions')}
            value={overview?.interactions ?? 0}
          />
        </div>

        <AnalyticsInsightStrip overview={overview} locale={locale} t={t} />
      </section>

      {operationalAlerts.length ? (
        <aside className="admin-analytics__alerts" aria-label={t('admin.analytics.alertsTitle')}>
          <ul>
            {operationalAlerts.map((alert) => (
              <li key={`${alert.kind}-${alert.entity_id}`}>
                <span>
                  <strong>{alert.subject}</strong>
                  {alert.detail ? ` · ${alert.detail}` : ''}
                </span>
                <button
                  type="button"
                  className="btn btn--small btn--outline"
                  onClick={() => onNavigate?.('payments', alert.entity_id)}
                >
                  {t('admin.analytics.alertsResolve')}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="admin-analytics__tabs">
        <DetailTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          variant="editorial"
          ariaLabel={t('admin.analytics.tabsAria')}
        />
      </div>

      {activeTab === TABS.overview ? (
        <div className="admin-analytics__panel" role="tabpanel">
          {/*
            Accesos al sistema (login), distinto del bloque "Actividad y
            accesos" de mas abajo, que cuenta ingresos por puerta a un evento.
            Se separan porque responden preguntas distintas y confundirlos
            llevaria a reportar entradas al predio como entradas a la cuenta.

            Personas e intentos van siempre juntos y con nombre distinto: la
            bitacora tiene cientos de asientos de login exitoso que son unas
            pocas personas entrando muchas veces, y leer eventos como personas
            es el error mas facil de cometer con este dato.
          */}
          <section className="admin-analytics__block" aria-labelledby="analytics-access">
            <AnalyticsBlockHead
              id="analytics-access"
              icon={LogIn}
              title={t('admin.analytics.access.title')}
              subtitle={t('admin.analytics.access.subtitle')}
            />
            {!hasAccessMetrics(access) ? (
              <p className="admin-analytics__empty">{t('admin.analytics.access.empty')}</p>
            ) : (
              <>
                <div className="admin-analytics__stat-grid">
                  <AnalyticsStatTile
                    label={t('admin.analytics.access.peopleIn')}
                    value={access.succeeded?.people ?? 0}
                    hint={`${t('admin.analytics.access.athletes')} ${count(access.succeeded?.athletes, locale)} · ${t('admin.analytics.access.staff')} ${count(access.succeeded?.staff, locale)}`}
                  />
                  <AnalyticsStatTile
                    label={t('admin.analytics.access.failed')}
                    value={access.failed?.events ?? 0}
                    hint={`${t('admin.analytics.access.failureRate')} ${percent(access.failureRate, locale)}`}
                    tone="alert"
                  />
                  <AnalyticsStatTile
                    label={t('admin.analytics.access.blocked')}
                    value={access.blockedPeople ?? 0}
                    hint={t('admin.analytics.access.blockedHint')}
                  />
                  <AnalyticsStatTile
                    label={t('admin.analytics.access.accountsCreated')}
                    value={access.accountsCreated ?? 0}
                  />
                </div>

                <h4>{t('admin.analytics.access.reasonsTitle')}</h4>
                {(access.failureReasons ?? []).length === 0 ? (
                  <p className="admin-analytics__empty">
                    {t('admin.analytics.access.reasonsEmpty')}
                  </p>
                ) : (
                  <RelativeBarList
                    items={access.failureReasons}
                    getKey={(reason) => reason.reason}
                    getLabel={(reason) => translateAccessReason(reason.reason, t)}
                    getWeight={(reason) => reason.attempts}
                    renderValue={(reason) =>
                      t('admin.analytics.access.reasonsCount', {
                        attempts: count(reason.attempts, locale),
                        people: count(reason.people, locale),
                      })
                    }
                  />
                )}
              </>
            )}
          </section>

          <section className="admin-analytics__block" aria-labelledby="analytics-funnel">
            <AnalyticsBlockHead
              id="analytics-funnel"
              icon={Activity}
              title={t('admin.analytics.funnelTitle')}
            />
            {funnel.length === 0 ? (
              <p className="admin-analytics__empty">{t('admin.analytics.funnelEmpty')}</p>
            ) : (
              <ol className="admin-analytics__funnel">
                {funnel.map((step) => (
                  <li
                    key={step.step_name}
                    className="admin-analytics__funnel-step"
                    style={{ '--funnel-width': step.totalRate ?? 0 }}
                  >
                    <div
                      className="admin-analytics__funnel-step-inner"
                      role="img"
                      aria-label={t('admin.analytics.funnelBarAlt', {
                        rate: percent(step.totalRate, locale),
                      })}
                    >
                      <span className="admin-analytics__funnel-name">
                        {funnelLabel(step.step_name, t)}
                      </span>
                      <strong className="admin-analytics__funnel-value">
                        {count(step.visitors, locale)}
                      </strong>
                      <p className="admin-analytics__funnel-meta">
                        {t('admin.analytics.funnelStepRate', {
                          rate: percent(step.stepRate, locale),
                          dropoff: count(step.dropoff, locale),
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="admin-analytics__block" aria-labelledby="analytics-activity">
            <AnalyticsBlockHead
              id="analytics-activity"
              icon={Users}
              title={t('admin.analytics.activityTitle')}
            />
            <div className="admin-analytics__stat-grid admin-analytics__stat-grid--secondary admin-analytics__stat-grid--duo">
              <AnalyticsStatTile
                compact
                label={t('admin.analytics.activityEngaged')}
                value={operational?.engagedVisitors ?? 0}
              />
              <AnalyticsStatTile
                compact
                label={t('admin.analytics.activityEntries')}
                value={operational?.access?.total ?? 0}
              />
            </div>
            <div className="admin-analytics__journey-grid">
              <div>
                <h4>{t('admin.analytics.activityActions')}</h4>
                {(operational?.keyActions ?? []).length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.activityActionsEmpty')}</p>
                ) : (
                  <RelativeBarList
                    items={operational.keyActions}
                    getKey={(item) => item.action}
                    getLabel={(item) => item.action}
                    getWeight={(item) => item.people}
                    mono
                    renderValue={(item) =>
                      t('admin.analytics.activityPeople', { count: count(item.people, locale) })
                    }
                  />
                )}
              </div>
              <div>
                <h4>{t('admin.analytics.activityGates')}</h4>
                {(operational?.access?.byGate ?? []).length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.activityGatesEmpty')}</p>
                ) : (
                  <RelativeBarList
                    items={operational.access.byGate}
                    getKey={(item) => item.gate}
                    getLabel={(item) => item.gate}
                    getWeight={(item) => item.entries}
                    renderValue={(item) => count(item.entries, locale)}
                  />
                )}
              </div>
            </div>
          </section>

          {canViewPaymentFailures ? (
            <section className="admin-analytics__block" aria-labelledby="analytics-failure-reasons">
              <h3 id="analytics-failure-reasons">
                <CircleAlert size={16} aria-hidden /> {t('admin.analytics.failureReasonsTitle')}
              </h3>
              {failureReasons.length === 0 ? (
                <p className="admin-analytics__empty">{t('admin.analytics.failureReasonsEmpty')}</p>
              ) : (
                <ul className="admin-analytics__journey-list">
                  {failureReasons.map((reason) => (
                    <li key={reason.code}>
                      <span
                        className={`status-pill status-pill--${FAILURE_SEVERITY_TONE[reason.severity] ?? 'neutral'}`}
                      >
                        {reason.title}
                      </span>
                      <strong>
                        {t('admin.analytics.failureReasonsCount', {
                          count: count(reason.count, locale),
                        })}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === TABS.pages ? (
        <div className="admin-analytics__panel" role="tabpanel">
          <div className="admin-analytics__pages">
            <section className="admin-analytics__block" aria-labelledby="analytics-pages">
              <AnalyticsBlockHead
                id="analytics-pages"
                icon={MousePointerClick}
                title={t('admin.analytics.pagesTitle')}
                subtitle={t('admin.analytics.pagesSubtitle')}
              />
              <PageRankingList
                pages={pages}
                locale={locale}
                t={t}
                selectedPath={heatmapPath}
                onSelect={setHeatmapPath}
              />
            </section>

            <section className="admin-analytics__block" aria-labelledby="analytics-heatmap">
              <AnalyticsBlockHead
                id="analytics-heatmap"
                icon={Flame}
                title={t('admin.analytics.heatmapTitle')}
                subtitle={
                  heatmapPath
                    ? t('admin.analytics.heatmapSubtitle', {
                        path: formatAnalyticsPath(heatmapPath, t).label,
                      })
                    : null
                }
              />
              <div
                className="admin-analytics__devices"
                role="group"
                aria-label={t('admin.analytics.heatmapDeviceLabel')}
              >
                {HEATMAP_DEVICES.map((device) => (
                  <button
                    key={device || 'all'}
                    type="button"
                    className={device === heatmapDevice ? 'is-active' : ''}
                    aria-pressed={device === heatmapDevice}
                    onClick={() => setHeatmapDevice(device)}
                  >
                    {t(`admin.analytics.devices.${device || 'all'}`)}
                  </button>
                ))}
              </div>
              {heatmapError ? (
                <p className="admin-analytics__empty" role="alert">
                  {heatmapError}
                </p>
              ) : (
                <Heatmap data={heatmap} locale={locale} t={t} />
              )}
              {heatmap?.elements?.length ? (
                <>
                  <h4>{t('admin.analytics.heatmapElementsTitle')}</h4>
                  <RelativeBarList
                    items={heatmap.elements.slice(0, 8)}
                    getKey={(element) => element.element_selector}
                    getLabel={(element) => element.label || element.element_selector}
                    getWeight={(element) => element.clicks}
                    renderValue={(element) => count(element.clicks, locale)}
                  />
                </>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === TABS.usage ? (
        <div className="admin-analytics__panel" role="tabpanel">
          {usageError ? (
            <p className="admin-analytics__empty" role="alert">
              {usageError}
            </p>
          ) : usageLoading && !usageLoaded ? (
            <LoadingState label={t('admin.analytics.usageLoading')} />
          ) : (
            <div className="admin-analytics__split">
              <section className="admin-analytics__block" aria-labelledby="analytics-flows">
                <h3 id="analytics-flows">
                  <Users size={16} aria-hidden /> {t('admin.analytics.flowsTitle')}
                </h3>
                {flows.length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.flowsEmpty')}</p>
                ) : (
                  <ul className="admin-analytics__flows">
                    {flows.map((flow) => (
                      <li key={`${flow.from_path}->${flow.to_path}`}>
                        <code title={flow.from_path}>{flow.from_path}</code>
                        <ArrowRight size={13} aria-hidden />
                        <code title={flow.to_path}>{flow.to_path}</code>
                        <strong>{count(flow.transitions, locale)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="admin-analytics__block" aria-labelledby="analytics-elements">
                <h3 id="analytics-elements">
                  <Sparkles size={16} aria-hidden /> {t('admin.analytics.elementsTitle')}
                </h3>
                {elements.length === 0 ? (
                  <p className="admin-analytics__empty">{t('admin.analytics.elementsEmpty')}</p>
                ) : (
                  <ol className="admin-analytics__ranking">
                    {elements.map((element) => (
                      <li key={element.element_selector}>
                        <span
                          className="admin-analytics__ranking-label"
                          title={element.label || element.element_selector}
                        >
                          {element.label || element.element_selector}
                        </span>
                        <code
                          className="admin-analytics__ranking-path"
                          title={Number(element.paths) > 1 ? undefined : element.sample_path}
                        >
                          {Number(element.paths) > 1
                            ? t('admin.analytics.elementsPaths', {
                                count: count(element.paths, locale),
                              })
                            : element.sample_path}
                        </code>
                        <strong>{count(element.clicks, locale)}</strong>
                        <small>
                          {t('admin.analytics.elementsVisitors', {
                            visitors: count(element.visitors, locale),
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === TABS.athlete && canViewIdentity ? (
        <div className="admin-analytics__panel" role="tabpanel">
          <AthleteJourney athletes={athletes} days={days} locale={locale} t={t} />
        </div>
      ) : null}
    </section>
  )
}
