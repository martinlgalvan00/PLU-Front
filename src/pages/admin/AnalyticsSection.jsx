import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CircleAlert,
  Flame,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserSearch,
  Users,
} from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminPageHeader from '../../components/admin/AdminPageHeader.jsx'
import DetailTabs from '../../components/admin/DetailTabs.jsx'
import { AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
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
  payment_submitted: 'admin.analytics.funnelSteps.paymentSubmitted',
  payment_approved: 'admin.analytics.funnelSteps.paymentApproved',
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
  return { from: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() }
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
  return (
    <span
      className={`admin-analytics__metric-delta admin-analytics__metric-delta--${direction}`}
      title={t('admin.analytics.metricsDeltaCaption')}
      aria-label={t('admin.analytics.metricsDeltaAria', { value: label })}
    >
      {label}
    </span>
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
      <h3 id="analytics-journey">
        <UserSearch size={16} aria-hidden /> {t('admin.analytics.journeyTitle')}
      </h3>

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
          <header className="admin-analytics__journey-head">
            <strong>{selected.fullName}</strong>
            <span>
              {t('admin.analytics.journeySummary', {
                sessions: count(summary.sessions, locale),
                pageviews: count(summary.pageviews, locale),
                clicks: count(summary.clicks, locale),
              })}
            </span>
          </header>

          {summary.pageviews === 0 && summary.clicks === 0 ? (
            <p className="admin-analytics__empty">{t('admin.analytics.journeyEmpty')}</p>
          ) : (
            <div className="admin-analytics__journey-grid">
              <div>
                <h4>{t('admin.analytics.journeyPages')}</h4>
                <ul className="admin-analytics__journey-list">
                  {(journey.pages ?? []).map((page) => (
                    <li key={page.path}>
                      <code>{page.path}</code>
                      <strong>{count(page.pageviews, locale)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>{t('admin.analytics.journeyElements')}</h4>
                <ul className="admin-analytics__journey-list">
                  {(journey.elements ?? []).map((element) => (
                    <li key={element.element_selector}>
                      <span>{element.label || element.element_selector}</span>
                      <strong>{count(element.clicks, locale)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
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
  const [operational, setOperational] = useState(null)
  const [operationalAlerts, setOperationalAlerts] = useState([])
  const [failureReasons, setFailureReasons] = useState([])
  const [heatmapPath, setHeatmapPath] = useState(null)
  const [heatmapDevice, setHeatmapDevice] = useState('')
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [usageLoaded, setUsageLoaded] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setUsageLoaded(false)
    try {
      // Primer pintado: overview, paginas, embudo y operativos. Recorridos y
      // ranking esperan al tab Uso; el mapa espera al tab Paginas.
      const [
        overviewResult,
        previousOverviewResult,
        pagesResult,
        funnelResult,
        operationalResult,
        alertsResult,
        failureReasonsResult,
      ] = await Promise.all([
        fetchAnalyticsOverview({ days }),
        // Mismo largo, tramo inmediatamente anterior: sin esto un numero
        // absoluto no dice si mejoro o empeoro respecto de lo de siempre.
        fetchAnalyticsOverview(previousRange(days)),
        fetchAnalyticsPages({ days, limit: 25 }),
        fetchAnalyticsFunnel({ days }),
        fetchAnalyticsOperationalSummary({ days }),
        fetchAnalyticsOperationalAlerts(),
        // Vive bajo `admin.payments.read`, no `admin.analytics.read`: sin el
        // permiso ni se pide, para no ofrecer un panel que iba a responder 403.
        canViewPaymentFailures ? getPaymentFailureReasons(currentRange(days)) : Promise.resolve([]),
      ])
      setOverview(overviewResult)
      setPreviousOverview(previousOverviewResult)
      setPages(pagesResult)
      setFunnel(withFunnelRates(funnelResult))
      setOperational(operationalResult)
      setOperationalAlerts(alertsResult)
      setFailureReasons(failureReasonsResult)
      // La ruta mas vista es el mapa de calor por defecto: es la que el equipo
      // va a querer mirar primero y evita una pantalla vacia.
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
      .catch(() => {
        if (cancelled) return
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
  }, [activeTab, days, usageLoaded])

  useEffect(() => {
    if (!heatmapPath || activeTab !== TABS.pages) return undefined
    let cancelled = false
    fetchAnalyticsHeatmap({ days, path: heatmapPath, deviceType: heatmapDevice || undefined })
      .then((result) => {
        if (!cancelled) setHeatmap(result)
      })
      .catch(() => {
        if (!cancelled) setHeatmap(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, days, heatmapDevice, heatmapPath])

  // DataTable identifica cada fila por `row.id`; la RPC agrega por ruta y no
  // devuelve uno.
  const pageRows = useMemo(() => pages.map((page) => ({ ...page, id: page.path })), [pages])

  const pageColumns = useMemo(
    () => [
      {
        key: 'path',
        label: t('admin.analytics.columns.path'),
        mobile: 'primary',
        render: (row) => <AdminMonoCell>{row.path}</AdminMonoCell>,
      },
      {
        key: 'pageviews',
        label: t('admin.analytics.columns.pageviews'),
        desktop: 'numeric',
        render: (row) => count(row.pageviews, locale),
      },
      {
        key: 'visitors',
        label: t('admin.analytics.columns.visitors'),
        desktop: 'numeric',
        render: (row) => count(row.visitors, locale),
      },
      {
        key: 'clicks',
        label: t('admin.analytics.columns.clicks'),
        desktop: 'numeric',
        render: (row) => count(row.clicks, locale),
      },
      {
        key: 'scroll',
        label: t('admin.analytics.columns.scroll'),
        desktop: 'numeric',
        mobile: 'hidden',
        render: (row) => percent(row.avg_scroll_depth, locale),
      },
      {
        key: 'exits',
        label: t('admin.analytics.columns.exits'),
        desktop: 'numeric',
        mobile: 'hidden',
        render: (row) => count(row.exits, locale),
      },
    ],
    [locale, t],
  )

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
            <div className="admin-analytics__ranges" role="group" aria-label={t('admin.analytics.rangeLabel')}>
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
            <button type="button" className="btn btn--small btn--outline" onClick={load} disabled={loading}>
              <RefreshCw size={14} aria-hidden /> {t('admin.analytics.refresh')}
            </button>
          </div>
        }
      />

      <section className="admin-analytics__pulse" aria-label={t('admin.analytics.metricsAria')}>
        <dl className="admin-analytics__metrics">
          <div>
            <dt>{t('admin.analytics.metrics.visitors')}</dt>
            <dd>
              {count(overview?.visitors, locale)}
              <MetricDelta current={overview?.visitors} previous={previousOverview?.visitors} locale={locale} t={t} />
            </dd>
          </div>
          <div>
            <dt>{t('admin.analytics.metrics.pageviews')}</dt>
            <dd>
              {count(overview?.pageviews, locale)}
              <MetricDelta current={overview?.pageviews} previous={previousOverview?.pageviews} locale={locale} t={t} />
            </dd>
          </div>
          <div>
            <dt>{t('admin.analytics.metrics.identified')}</dt>
            <dd>
              {count(overview?.identifiedVisitors, locale)}
              <MetricDelta
                current={overview?.identifiedVisitors}
                previous={previousOverview?.identifiedVisitors}
                locale={locale}
                t={t}
              />
            </dd>
          </div>
          <div>
            <dt>{t('admin.analytics.metrics.bounce')}</dt>
            <dd>
              {percent(overview?.bounceRate, locale)}
              <MetricDelta
                current={overview?.bounceRate}
                previous={previousOverview?.bounceRate}
                locale={locale}
                t={t}
              />
            </dd>
          </div>
        </dl>
        <p className="admin-analytics__summary">
          {t('admin.analytics.summary', {
            sessions: count(overview?.sessions, locale),
            duration: duration(overview?.avgDurationSeconds),
            interactions: count(overview?.interactions, locale),
          })}
        </p>
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
          <section className="admin-analytics__block" aria-labelledby="analytics-funnel">
            <h3 id="analytics-funnel">
              <Activity size={16} aria-hidden /> {t('admin.analytics.funnelTitle')}
            </h3>
            {funnel.length === 0 ? (
              <p className="admin-analytics__empty">{t('admin.analytics.funnelEmpty')}</p>
            ) : (
              <ol className="admin-analytics__funnel">
                {funnel.map((step) => (
                  <li key={step.step_name}>
                    <div className="admin-analytics__funnel-head">
                      <span className="admin-analytics__funnel-name">
                        {funnelLabel(step.step_name, t)}
                      </span>
                      <strong>{count(step.visitors, locale)}</strong>
                    </div>
                    <div
                      className="admin-analytics__funnel-bar"
                      role="img"
                      aria-label={t('admin.analytics.funnelBarAlt', {
                        rate: percent(step.totalRate, locale),
                      })}
                    >
                      <span style={{ '--funnel-fill': step.totalRate ?? 0 }} />
                    </div>
                    <small>
                      {t('admin.analytics.funnelStepRate', {
                        rate: percent(step.stepRate, locale),
                        dropoff: count(step.dropoff, locale),
                      })}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="admin-analytics__block" aria-labelledby="analytics-activity">
            <h3 id="analytics-activity">
              <Users size={16} aria-hidden /> {t('admin.analytics.activityTitle')}
            </h3>
            <p className="admin-analytics__summary">
              {t('admin.analytics.activitySummary', {
                people: count(operational?.engagedVisitors, locale),
                entries: count(operational?.access?.total, locale),
              })}
            </p>
            <div className="admin-analytics__journey-grid">
              <div>
                <h4>{t('admin.analytics.activityActions')}</h4>
                <ul className="admin-analytics__journey-list">
                  {(operational?.keyActions ?? []).map((item) => (
                    <li key={item.action}>
                      <span>{item.action}</span>
                      <strong>
                        {t('admin.analytics.activityPeople', { count: count(item.people, locale) })}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>{t('admin.analytics.activityGates')}</h4>
                <ul className="admin-analytics__journey-list">
                  {(operational?.access?.byGate ?? []).map((item) => (
                    <li key={item.gate}>
                      <span>{item.gate}</span>
                      <strong>{count(item.entries, locale)}</strong>
                    </li>
                  ))}
                </ul>
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
                        {t('admin.analytics.failureReasonsCount', { count: count(reason.count, locale) })}
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
              <h3 id="analytics-pages">
                <MousePointerClick size={16} aria-hidden /> {t('admin.analytics.pagesTitle')}
              </h3>
              <div className="admin-analytics__pages-table">
                <AdminDataTable
                  ariaLabel={t('admin.analytics.pagesTitle')}
                  columns={pageColumns}
                  rows={pageRows}
                  emptyMessage={t('admin.analytics.pagesEmpty')}
                  onRowClick={(row) => setHeatmapPath(row.path)}
                  getRowClassName={(row) =>
                    row.path === heatmapPath ? 'data-table__row--selected' : ''
                  }
                />
              </div>
            </section>

            <section className="admin-analytics__block" aria-labelledby="analytics-heatmap">
              <h3 id="analytics-heatmap">
                <Flame size={16} aria-hidden /> {t('admin.analytics.heatmapTitle')}
              </h3>
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
              <Heatmap data={heatmap} locale={locale} t={t} />
              {heatmap?.elements?.length ? (
                <ul className="admin-analytics__elements">
                  {heatmap.elements.slice(0, 8).map((element) => (
                    <li key={element.element_selector}>
                      <span className="admin-analytics__element-label">
                        {element.label || element.element_selector}
                      </span>
                      <strong>{count(element.clicks, locale)}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === TABS.usage ? (
        <div className="admin-analytics__panel" role="tabpanel">
          {usageLoading && !usageLoaded ? (
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
                        <code>{flow.from_path}</code>
                        <ArrowRight size={13} aria-hidden />
                        <code>{flow.to_path}</code>
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
                        <span className="admin-analytics__ranking-label">
                          {element.label || element.element_selector}
                        </span>
                        <code className="admin-analytics__ranking-path">
                          {Number(element.paths) > 1
                            ? t('admin.analytics.elementsPaths', { count: count(element.paths, locale) })
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
