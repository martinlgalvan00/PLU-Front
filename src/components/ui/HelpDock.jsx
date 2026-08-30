import { LifeBuoy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Botón de ayuda persistente de las pantallas públicas y de la cuenta.
 *
 * Es una píldora con la palabra "Ayuda" y no un "?" circular a propósito: el
 * público que se traba en estos trámites no lee el signo de pregunta como un
 * control. Con etiqueta es el elemento más visible que se puede poner sin
 * romper la jerarquía de la pantalla, y el target queda holgado para un dedo.
 *
 * El punto de estado aparece sólo cuando el trámite tiene un paso pendiente
 * accionable — es un indicador de "te falta algo", no un contador de
 * notificaciones. Se acompaña de texto en el nombre accesible para que no
 * dependa del color.
 *
 * Presentacional: el estado y los datos los resuelve `HelpLayer`. En modo
 * asistido este botón no se monta — la ayuda pasa a vivir en `AssistNavBar`.
 *
 * Posición: siempre anclado a la esquina inferior derecha del viewport
 * (`position: fixed` + safe-area). No vive dentro de PageTransition a
 * propósito, para no desmontarse al cambiar de pantalla.
 */
export default function HelpDock({ open = false, pending = false, onToggle }) {
  const { t } = useI18n()

  return (
    <div className="help-dock" data-tour="help-dock">
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
        <span className="help-dock__glyph" aria-hidden>
          <LifeBuoy size={15} strokeWidth={2} className="help-dock__icon" />
        </span>
        <span className="help-dock__label">{t('help.trigger')}</span>
        {pending && !open ? (
          <span className="help-dock__pending" aria-hidden />
        ) : null}
      </button>
    </div>
  )
}
