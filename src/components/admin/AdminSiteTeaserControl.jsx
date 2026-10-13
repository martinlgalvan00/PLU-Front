import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildPublicViewPath } from '../../lib/publicViewPaths.js'

/** Lo que dura la secuencia de "salimos al aire" tras prender el anuncio. */
const LAUNCH_MS = 1600

/**
 * AdminSiteTeaserControl — PLU ARG
 *
 * Interruptor del anuncio "Pronto habrá novedades" de la página pública de
 * Eventos. No hay nada que cargar —ni fecha, ni sede, ni título— porque el
 * anuncio no existe como evento: avisa que viene algo sin decir qué.
 *
 * Es una tira, no una pieza: estado, titular, el enlace para verlo en vivo y
 * el interruptor. Antes llevaba un monitor en miniatura del anuncio que
 * ocupaba más alto que las filas de eventos que tiene encima; el estado lo
 * dicen el punto, el texto y el interruptor, así que la imagen no informaba
 * nada. Al pasar de apagado a prendido el estado entra con un pequeño
 * movimiento de una sola vez (`is-launching`).
 *
 * `enabled` en `null` es "todavía no se leyó": se muestra apagado y con el
 * interruptor deshabilitado en vez de adivinar un estado que podría ser el
 * contrario.
 */
export default function AdminSiteTeaserControl({
  busy = false,
  canEdit = false,
  enabled = null,
  loadFailed = false,
  onRetry,
  onToggle,
}) {
  const { t } = useI18n()
  const known = enabled !== null
  const on = enabled === true
  const livePath = buildPublicViewPath('events')

  // La secuencia sólo corre si se vio el estado apagado y pasó a prendido: la
  // primera lectura (`null` → `true`) es abrir la pantalla, no lanzar nada.
  const [launching, setLaunching] = useState(false)
  const previous = useRef(enabled)
  useEffect(() => {
    const wasOff = previous.current === false
    previous.current = enabled
    if (!(wasOff && enabled === true)) return undefined
    setLaunching(true)
    const timer = window.setTimeout(() => setLaunching(false), LAUNCH_MS)
    return () => window.clearTimeout(timer)
  }, [enabled])

  const state = !known ? 'unknown' : on ? 'on' : 'off'

  return (
    <div
      className={`admin-site-teaser is-${state}${launching ? ' is-launching' : ''}`}
      data-state={state}
    >
      <div className="admin-site-teaser__copy">
        <p className="admin-site-teaser__status" aria-hidden>
          <span className="admin-site-teaser__dot" />
          {t(`admin.sections.events.teaser.status.${state}`)}
        </p>
        <strong id="admin-site-teaser-label">{t('admin.sections.events.teaser.title')}</strong>
        {on && livePath ? (
          <a
            className="admin-site-teaser__view"
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('admin.sections.events.teaser.view')}
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}
        <p id="admin-site-teaser-hint">
          {loadFailed
            ? t('admin.sections.events.teaser.loadError')
            : t(on ? 'admin.sections.events.teaser.hintOn' : 'admin.sections.events.teaser.hint')}
        </p>
        {on && livePath ? (
          <a
            className="admin-site-teaser__view"
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('admin.sections.events.teaser.view')}
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}
      </div>

      {loadFailed && typeof onRetry === 'function' ? (
        <button
          type="button"
          className="admin-site-teaser__retry"
          disabled={busy}
          onClick={onRetry}
        >
          {t('admin.sections.events.teaser.retry')}
        </button>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="admin-site-teaser-label"
          aria-describedby="admin-site-teaser-hint"
          className={`admin-site-teaser__switch-btn${on ? ' is-on' : ''}`}
          disabled={!canEdit || !known || busy}
          onClick={() => onToggle?.(!on)}
        >
          <span className="visually-hidden">
            {on ? t('admin.sections.events.teaser.on') : t('admin.sections.events.teaser.off')}
          </span>
          <span className="admin-site-teaser__switch" aria-hidden />
        </button>
      )}
    </div>
  )
}
