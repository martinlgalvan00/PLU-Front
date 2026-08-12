import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Flame,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserSearch,
  Users,
} from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminMetricCard from '../../components/admin/AdminMetricCard.jsx'
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
  fetchAnalyticsPages,
  fetchAthleteJourney,
  withFunnelRates,
} from '../../services/analyticsReportService.js'

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

export default function AnalyticsSection({ athletes = [], canViewIdentity = false }) {
  const { locale, t } = useI18n()
  const [days, setDays] = useState(30)
  const [overview, setOverview] = useState(null)
  const [pages, setPages] = useState([])
  const [flows, setFlows] = useState([])
  const [funnel, setFunnel] = useState([])
  const [elements, setElements] = useState([])
  const [heatmapPath, setHeatmapPath] = useState(null)
  const [heatmapDevice, setHeatmapDevice] = useState('')
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Las consultas son independientes: en serie el panel tardaba lo que
      // suman, y son las mismas tablas con distinta agregacion.
      const [overviewResult, pagesResult, flowsResult, funnelResult, elementsResult] =
        await Promise.all([
          fetchAnalyticsOverview({ days }),
          fetchAnalyticsPages({ days, limit: 25 }),
          fetchAnalyticsFlows({ days, limit: 20 }),
          fetchAnalyticsFunnel({ days }),
          fetchAnalyticsElements({ days, limit: 25 }),
        ])
      setOverview(overviewResult)
      setPages(pagesResult)
      setFlows(flowsResult)
      setFunnel(withFunnelRates(funnelResult))
      setElements(elementsResult)
      // La ruta mas vista es el mapa de calor por defecto: es la que el equipo
      // va a querer mirar primero y evita una pantalla vacia.
      setHeatmapPath((current) => current ?? pagesResult[0]?.path ?? null)
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.analytics.error'))
    } finally {
      setLoading(false)
    }
  }, [days, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!heatmapPath) return
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
  }, [days, heatmapDevice, heatmapPath])

  // DataTable identifica cada fila por `row.id`; la RPC agrega por ruta y no
  // devuelve uno.
  const pageRows = useMemo(() => pages.map((page) => ({ ...page, id: page.path })), [pages])

  const pageColumns = useMemo(
    () => [
      {
        key: 'path',
        header: t('admin.analytics.columns.path'),
        render: (row) => <AdminMonoCell>{row.path}</AdminMonoCell>,
      },
      {
        key: 'pageviews',
        header: t('admin.analytics.columns.pageviews'),
        render: (row) => count(row.pageviews, locale),
      },
      {
        key: 'visitors',
        header: t('admin.analytics.columns.visitors'),
        render: (row) => count(row.visitors, locale),
      },
      {
        key: 'clicks',
        header: t('admin.analytics.columns.clicks'),
        render: (row) => count(row.clicks, locale),
      },
      {
        key: 'scroll',
        header: t('admin.analytics.columns.scroll'),
        render: (row) => percent(row.avg_scroll_depth, locale),
      },
      {
        key: 'exits',
        header: t('admin.analytics.columns.exits'),
        render: (row) => count(row.exits, locale),
      },
      {
        key: 'heatmap',
        header: '',
        render: (row) => (
          <button
            type="button"
            className="admin-analytics__heatmap-trigger"
            onClick={() => setHeatmapPath(row.path)}
            aria-pressed={heatmapPath === row.path}
          >
            <Flame size={14} aria-hidden />
            {t('admin.analytics.viewHeatmap')}
          </button>
        ),
      },
    ],
    [heatmapPath, locale, t],
  )

  if (loading && !overview) return <LoadingState label={t('admin.analytics.loading')} />
  if (error && !overview) return <ErrorState message={error} onRetry={load} />

  return (
    <section className="admin-analytics">
      <header className="admin-analytics__header">
        <div>
          <h2>{t('admin.analytics.title')}</h2>
          <p>{t('admin.analytics.subtitle')}</p>
        </div>
        <div className="admin-analytics__controls">
          <div className="admin-analytics__ranges" role="group" aria-label={t('admin.analytics.rangeLabel')}>
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                className={range === days ? 'is-active' : ''}
                aria-pressed={range === days}
                onClick={() => setDays(range)}
              >
                {t('admin.analytics.rangeDays', { days: range })}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--small btn--outline" onClick={load} disabled={loading}>
            <RefreshCw size={14} aria-hidden /> {t('admin.analytics.refresh')}
          </button>
        </div>
      </header>

      <div className="admin-analytics__metrics">
        <AdminMetricCard
          icon="users"
          value={count(overview?.visitors, locale)}
          label={t('admin.analytics.metrics.visitors')}
          index={0}
        />
        <AdminMetricCard
          icon="clipboard"
          value={count(overview?.pageviews, locale)}
          label={t('admin.analytics.metrics.pageviews')}
          index={1}
        />
        <AdminMetricCard
          icon="badge"
          value={count(overview?.identifiedVisitors, locale)}
          label={t('admin.analytics.metrics.identified')}
          index={2}
        />
        <AdminMetricCard
          icon="shield"
          value={percent(overview?.bounceRate, locale)}
          label={t('admin.analytics.metrics.bounce')}
          index={3}
        />
      </div>

      <p className="admin-analytics__summary">
        {t('admin.analytics.summary', {
          sessions: count(overview?.sessions, locale),
          duration: duration(overview?.avgDurationSeconds),
          interactions: count(overview?.interactions, locale),
        })}
      </p>

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

      <section className="admin-analytics__block" aria-labelledby="analytics-pages">
        <h3 id="analytics-pages">
          <MousePointerClick size={16} aria-hidden /> {t('admin.analytics.pagesTitle')}
        </h3>
        <AdminDataTable
          columns={pageColumns}
          rows={pageRows}
          emptyMessage={t('admin.analytics.pagesEmpty')}
        />
      </section>

      <div className="admin-analytics__split">
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
      </div>

      {/* Lo mas usado del sitio entero. El bloque del mapa de calor ya lista los
          elementos de *una* ruta; esto responde la otra pregunta: que control usa
          mas la gente sin importar donde este. `visitors` va al lado de `clicks`
          porque mil clicks de una persona no son mil personas. */}
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

      {canViewIdentity ? (
        <AthleteJourney athletes={athletes} days={days} locale={locale} t={t} />
      ) : null}
    </section>
  )
}
