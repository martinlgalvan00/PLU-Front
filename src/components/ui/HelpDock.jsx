import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Botón de ayuda persistente de las pantallas públicas y de la cuenta.
 *
 * Rectángulo sólo con ícono: la palabra "Ayuda" queda como texto para lector
 * de pantalla y el nombre accesible dice qué abre, así que el control no
 * depende de reconocer el ícono. El target es de 48×44, holgado para un dedo.
 *
 * El punto de estado aparece sólo cuando el trámite tiene un paso pendiente
 * accionable — es un indicador de "te falta algo", no un contador de
 * notificaciones. Se acompaña de texto en el nombre accesible para que no
 * dependa del color.
 *
 * Presentacional: el estado y los datos los resuelve `HelpLayer`. En modo
 * asistido este botón no se monta — la ayuda pasa a vivir en `AssistNavBar`.
 *
 * Posición: portal a `document.body` + `position: fixed` + safe-area. No
 * puede vivir dentro de `.app-shell` (ni de PageTransition): `overflow-x:
 * clip` / `isolation` del shell forman un containing block y el botón
 * scrolleaba con la página en vez de quedarse en la esquina del viewport.
 */
export default function HelpDock({ open = false, pending = false, onToggle }) {
  const { t } = useI18n()

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={`help-dock${open ? ' is-open' : ''}`} data-tour="help-dock">
      {/* Botón de divulgación: un solo nombre accesible y el estado contado
          por `aria-expanded`. Con un "Cerrar la ayuda" acá quedaban dos
          controles distintos con el mismo nombre que la X del panel. */}
      <button
        type="button"
        className={`help-dock__button${open ? ' is-open' : ''}${pending ? ' has-pending' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t(pending ? 'help.triggerPendingAria' : 'help.triggerAria')}
        onClick={onToggle}
      >
        <CircleHelp size={20} strokeWidth={1.9} className="help-dock__icon" aria-hidden />
        <span className="help-dock__label">{t('help.trigger')}</span>
        {pending && !open ? <span className="help-dock__pending" aria-hidden /> : null}
      </button>
    </div>,
    document.body,
  )
}
