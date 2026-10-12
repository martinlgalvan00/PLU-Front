import { Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * AdminSiteTeaserControl — PLU ARG
 *
 * Interruptor del anuncio "Pronto habrá novedades" de la página pública de
 * Eventos. Fila plana sobre el listado: es una decisión de una línea, no un
 * formulario. No hay nada que cargar —ni fecha, ni sede, ni título— porque el
 * anuncio no existe como evento: avisa que viene algo sin decir qué.
 *
 * `enabled` en `null` es "todavía no se leyó": la fila se muestra deshabilitada
 * en vez de adivinar un estado que podría ser el contrario.
 */
export default function AdminSiteTeaserControl({
  busy = false,
  canEdit = false,
  enabled = null,
  loadFailed = false,
  onToggle,
}) {
  const { t } = useI18n()
  const known = enabled !== null
  const on = enabled === true

  return (
    <div className="admin-site-teaser">
      <span className="admin-site-teaser__icon" aria-hidden>
        <Sparkles size={16} />
      </span>
      <div className="admin-site-teaser__copy">
        <strong id="admin-site-teaser-label">{t('admin.sections.events.teaser.title')}</strong>
        <p id="admin-site-teaser-hint">
          {loadFailed
            ? t('admin.sections.events.teaser.loadError')
            : t('admin.sections.events.teaser.hint')}
        </p>
      </div>
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
    </div>
  )
}
