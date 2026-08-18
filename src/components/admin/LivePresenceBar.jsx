import { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchAnalyticsLive } from '../../services/analyticsReportService.js'

/**
 * LivePresenceBar — PLU ARG
 *
 * Cuanta gente hay en el sitio ahora mismo, donde esta parada y como viene la
 * curva de la ultima hora.
 *
 * El informe de analitica contesta "cuanta gente entro en los ultimos 30 dias",
 * que es la pregunta de producto. Durante un evento en curso la pregunta es
 * otra --"¿esta entrando gente ahora?, ¿el sitio esta aguantando?"-- y no la
 * contestaba nada: habia que abrir la base y escribir el `where last_seen_at >
 * now() - interval '5 minutes'` a mano.
 *
 * Va arriba del informe historico y no en una pestaña propia a proposito:
 * cuando hay algo pasando, "ahora" manda sobre "los ultimos 30 dias", y una
 * metrica en vivo detras de un click es una metrica que nadie mira.
 *
 * Tres decisiones que no son cosmeticas:
 *
 *   - El refresco se detiene con la pestaña oculta. Un panel olvidado abierto
 *     toda la noche haria 5.760 consultas sin nadie del otro lado.
 *   - El intervalo se reprograma despues de cada respuesta y no con un
 *     `setInterval` fijo: si la consulta tarda, los pedidos no se apilan.
 *   - Un fallo de refresco no borra lo ultimo que se vio. Se marca como dato
 *     viejo, porque una barra en blanco durante un evento se lee como "no hay
 *     nadie", que es la conclusion opuesta a la correcta.
 */

const REFRESH_MS = 15_000

/**
 * Curva de concurrencia de la ultima hora. Es un sparkline y no un grafico con
 * ejes porque la lectura que importa es la forma --sube, baja, se aplano--, no
 * el valor de cada minuto: ese ya esta en el numero grande de al lado.
 */
function ConcurrencySparkline({ series, label }) {
  if (!series?.length) return null

  const values = series.map((point) => Number(point.sessions ?? 0))
  const max = Math.max(...values, 1)
  const width = 100
  const height = 28
  const step = values.length > 1 ? width / (values.length - 1) : width

  const points = values.map((value, index) => {
    const x = index * step
    // El eje Y del SVG crece hacia abajo: el valor se invierte para que el pico
    // quede arriba.
    const y = height - (value / max) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg
      className="admin-live__spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {/* Relleno bajo la curva: cierra contra la base para dar volumen sin
          agregar una segunda forma que leer. */}
      <polygon
        className="admin-live__spark-area"
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
      />
      <polyline className="admin-live__spark-line" points={points.join(' ')} />
    </svg>
  )
}

export default function LivePresenceBar({ windowMinutes = 5 }) {
  const { t, locale } = useI18n()
  const [data, setData] = useState(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  const number = useCallback(
    (value) =>
      new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0)),
    [locale],
  )

  const load = useCallback(async () => {
    try {
      const result = await fetchAnalyticsLive({ windowMinutes })
      if (!mountedRef.current) return
      setData(result)
      setStale(false)
      setFailed(false)
    } catch {
      if (!mountedRef.current) return
      // Se conserva la ultima lectura buena y se marca como vieja: vaciar la
      // barra ante un 500 diria "no hay nadie", que es peor que un dato de hace
      // un minuto.
      setStale(true)
      setFailed((previous) => previous || !data)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [data, windowMinutes])

  useEffect(() => {
    mountedRef.current = true

    /**
     * Reprograma despues de cada respuesta —no `setInterval`— para que dos
     * consultas lentas no se solapen, y solo con la pestaña visible.
     */
    const tick = async () => {
      if (document.visibilityState === 'visible') await load()
      if (!mountedRef.current) return
      timerRef.current = window.setTimeout(tick, REFRESH_MS)
    }

    void tick()

    // Al volver a la pestaña se refresca de inmediato: el dato que quedo en
    // pantalla puede ser de hace horas.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // `load` cambia en cada render por depender de `data`; incluirlo reiniciaria
    // el ciclo de refresco en cada respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes])

  if (loading && !data) {
    return (
      <section
        className="admin-live admin-live--loading"
        aria-label={t('admin.analytics.live.aria')}
      >
        <p className="admin-live__loading">{t('admin.analytics.live.loading')}</p>
      </section>
    )
  }

  if (failed && !data) {
    return (
      <section
        className="admin-live admin-live--failed"
        aria-label={t('admin.analytics.live.aria')}
      >
        <p className="admin-live__loading">{t('admin.analytics.live.error')}</p>
      </section>
    )
  }

  const visitors = Number(data?.visitors ?? 0)
  const pages = data?.pages ?? []

  return (
    <section
      className={`admin-live${stale ? ' admin-live--stale' : ''}`}
      aria-label={t('admin.analytics.live.aria')}
    >
      <div className="admin-live__headline">
        <p className="admin-live__status">
          {/*
            Unico elemento con loop de la pantalla, y comunica estado operativo
            real: late mientras el dato es fresco y se apaga cuando el refresco
            falla. Con `prefers-reduced-motion` queda fijo, sin perder el color
            que ya distingue los dos estados.
          */}
          <span className="admin-live__pulse" aria-hidden />
          <Radio size={13} aria-hidden />
          {stale ? t('admin.analytics.live.stale') : t('admin.analytics.live.now')}
        </p>

        <p className="admin-live__count">
          {/*
            `aria-live="polite"` y no `assertive`: el numero cambia solo cada 15
            segundos y no debe interrumpir a quien esta leyendo otra cosa.
          */}
          <strong aria-live="polite" aria-atomic>
            {number(visitors)}
          </strong>
          <span>
            {visitors === 1
              ? t('admin.analytics.live.personSingular')
              : t('admin.analytics.live.personPlural')}
          </span>
        </p>

        <ConcurrencySparkline
          series={data?.series}
          label={t('admin.analytics.live.sparkAria', { peak: number(data?.peakLastHour) })}
        />
      </div>

      <dl className="admin-live__metrics">
        <div>
          <dt>{t('admin.analytics.live.identified')}</dt>
          <dd>{number(data?.identified)}</dd>
        </div>
        <div>
          <dt>{t('admin.analytics.live.peakHour')}</dt>
          <dd>{number(data?.peakLastHour)}</dd>
        </div>
        <div>
          <dt>{t('admin.analytics.live.peakToday')}</dt>
          <dd>{number(data?.peakToday)}</dd>
        </div>
        <div>
          <dt>{t('admin.analytics.live.today')}</dt>
          <dd>{number(data?.visitorsToday)}</dd>
        </div>
      </dl>

      {pages.length ? (
        <ul className="admin-live__pages">
          {pages.slice(0, 5).map((page) => (
            <li key={page.path}>
              <span className="admin-live__page-path">{page.path}</span>
              <span className="admin-live__page-count">{number(page.visitors)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-live__empty">
          {t('admin.analytics.live.empty', { minutes: data?.windowMinutes ?? windowMinutes })}
        </p>
      )}

      {stale ? (
        <p className="admin-live__stale-note" role="status">
          <RefreshCw size={12} aria-hidden /> {t('admin.analytics.live.staleNote')}
        </p>
      ) : null}
    </section>
  )
}
