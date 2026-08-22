import {
  BadgeCheck,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Home,
  LifeBuoy,
  LogIn,
  QrCode,
  User,
  UserPlus,
} from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Navegación recortada del modo asistido.
 *
 * Cuatro destinos grandes y fijos abajo, el patrón que este público ya
 * reconoce del banco o de WhatsApp. El recorte es el punto: en el navbar
 * completo hay dos menús desplegables y catorce destinos, y ninguno responde
 * la pregunta que la persona sí tiene, que es "¿qué hago ahora?".
 *
 * El segundo ítem es exactamente esa respuesta: la acción que `athleteJourney`
 * calculó como próximo paso, con su nombre corto. Es el único con acento —
 * el resto son neutros — así que la barra tiene una sola acción principal.
 *
 * No hay pérdida de acceso: el navbar sigue arriba con los enlaces directos y
 * el footer mantiene el índice completo de las catorce pantallas.
 */

/** Ícono por acción del trámite. Funcional, no decorativo: cada uno nombra el
 *  objeto real del paso (ficha, credencial, inscripción). */
const ACTION_ICON = Object.freeze({
  account: UserPlus,
  membership: BadgeCheck,
  registration: ClipboardCheck,
  registrationPending: Clock,
  credential: QrCode,
  events: CalendarDays,
})

const ACTION_LABEL_KEY = Object.freeze({
  account: 'help.assistNav.actionAccount',
  membership: 'help.assistNav.actionMembership',
  registration: 'help.assistNav.actionRegistration',
  registrationPending: 'help.assistNav.actionRegistrationPending',
  credential: 'help.assistNav.actionCredential',
  events: 'help.assistNav.actionEvents',
})

function NavItem({ icon: Icon, label, active, tone = 'default', badge = false, onClick, ...rest }) {
  return (
    <button
      type="button"
      className={`assist-nav__item assist-nav__item--${tone}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      {...rest}
    >
      <span className="assist-nav__icon" aria-hidden>
        <Icon size={22} strokeWidth={1.9} />
        {badge ? <span className="assist-nav__badge" aria-hidden /> : null}
      </span>
      <span className="assist-nav__label">{label}</span>
    </button>
  )
}

export default function AssistNavBar({
  view,
  actionKey = 'credential',
  isAthlete = false,
  pending = false,
  helpOpen = false,
  onNavigate,
  onRunAction,
  onOpenHelp,
}) {
  const { t } = useI18n()
  const ActionIcon = ACTION_ICON[actionKey] ?? BadgeCheck
  const accountView = isAthlete ? 'profile' : 'login'

  return (
    <nav className="assist-nav" aria-label={t('help.assistNav.aria')}>
      <div className="assist-nav__inner">
        {/* `data-tour` por destino: el recorrido de orientación del modo simple
            explica los cuatro botones de uno en uno y necesita apuntarlos. */}
        <NavItem
          icon={Home}
          label={t('help.assistNav.home')}
          active={view === 'home'}
          onClick={() => onNavigate?.('home')}
          data-tour="assist-nav-home"
        />
        <NavItem
          icon={ActionIcon}
          label={t(ACTION_LABEL_KEY[actionKey] ?? ACTION_LABEL_KEY.credential)}
          tone="action"
          onClick={onRunAction}
          data-tour="assist-nav-action"
        />
        <NavItem
          icon={isAthlete ? User : LogIn}
          label={t(isAthlete ? 'help.assistNav.account' : 'help.assistNav.login')}
          active={view === 'profile' || view === 'login'}
          onClick={() => onNavigate?.(accountView)}
          data-tour="assist-nav-account"
        />
        {/* Dos `data-tour`: `help-dock` para los recorridos que terminan
            señalando la ayuda (el mismo blanco que el botón flotante) y
            `assist-nav-help` para el paso propio de la orientación. */}
        <NavItem
          icon={LifeBuoy}
          label={t('help.assistNav.help')}
          badge={pending}
          onClick={onOpenHelp}
          data-tour="help-dock assist-nav-help"
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
        />
      </div>
    </nav>
  )
}
