import { ArrowRight, Check, Compass, MapPin, MessageCircle, Type, X } from 'lucide-react'
import { usePaymentModal } from '../checkout/usePaymentModal.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAssist } from '../../providers/AssistProvider.jsx'
import { formatShortDate } from '../../lib/format.js'
import { JOURNEY_STATES } from '../../lib/athleteJourney.js'

const { DONE, TODO, BLOCKED, PENDING, CLOSED, UNAVAILABLE } = JOURNEY_STATES

/** Etiqueta corta del estado. Va escrita, no sólo en color: el estado tiene que
 *  leerse igual en blanco y negro o con visión de color reducida. */
const STATE_LABEL_KEY = Object.freeze({
  [DONE]: 'help.stateDone',
  [TODO]: 'help.stateNow',
  [PENDING]: 'help.statePending',
  [BLOCKED]: 'help.stateBlocked',
  [CLOSED]: 'help.stateClosed',
  [UNAVAILABLE]: 'help.stateUnavailable',
})

const ACTION_LABEL_KEY = Object.freeze({
  account: 'help.actionAccount',
  membership: 'help.actionMembership',
  registration: 'help.actionRegistration',
  registrationPending: 'help.actionRegistrationPending',
  credential: 'help.actionCredential',
  events: 'help.actionEvents',
})

function stepTitle(step, journey, t) {
  if (step.id !== 'registration') return t(`help.steps.${step.id}.title`)
  return journey.eventTitle
    ? t('help.steps.registration.titleWithEvent', { event: journey.eventTitle })
    : t('help.steps.registration.title')
}

/**
 * El detalle es la mitad del valor del panel: cuando un paso está bloqueado
 * dice *por qué* lo está, que es exactamente el dato que faltaba en la guía
 * fija de tres pasos.
 */
function stepDetail(step, journey, t, locale) {
  if (step.id === 'account') {
    return t(step.state === DONE ? 'help.steps.account.done' : 'help.steps.account.todo')
  }

  if (step.id === 'membership') {
    if (step.state === DONE) {
      return journey.membershipExpiresAt
        ? t('help.steps.membership.done', {
            date: formatShortDate(journey.membershipExpiresAt, locale),
          })
        : t('help.steps.membership.doneNoDate')
    }
    if (step.state === BLOCKED) return t('help.steps.membership.blocked')
    return t('help.steps.membership.todo')
  }

  switch (step.state) {
    case DONE:
      return t('help.steps.registration.done')
    case PENDING:
      return t('help.steps.registration.pending')
    case CLOSED:
      return t('help.steps.registration.closed')
    case UNAVAILABLE:
      return t('help.steps.registration.unavailable')
    case BLOCKED:
      // Sin cuenta faltan los dos eslabones anteriores, no sólo el primero:
      // repetir "necesitás la cuenta del paso 1" en los pasos 2 y 3 se leía
      // como un error de la pantalla.
      return t(
        journey.eventStatus === 'guest'
          ? 'help.steps.registration.blockedAccount'
          : 'help.steps.registration.blockedMembership',
      )
    default:
      return t('help.steps.registration.todo')
  }
}

/**
 * Ayuda guiada de los trámites públicos: dónde estás, un mapa de tres pasos con
 * tu estado real, y **una sola** acción, la que te corresponde ahora.
 *
 * No decide reglas ni navega: `resolveAthleteJourney` compone el estado y
 * `HelpLayer` ejecuta la acción con las mismas funciones que usan los CTA de
 * cada pantalla.
 */
export default function HelpPanel({
  journey,
  view = null,
  atDestination = false,
  tourKind = null,
  resume = null,
  onClose,
  onNavigate,
  onRunNext,
  onLogin,
  onStartTour = null,
}) {
  const { locale, t } = useI18n()
  const { assist, toggleAssist } = useAssist()
  const panelRef = usePaymentModal(onClose)
  const { next } = journey

  // Ya estamos en la pantalla del próximo paso: navegar de nuevo no cambiaría
  // nada, así que la acción principal pasa a ser el recorrido guiado, que sí
  // hace algo acá. Si esta pantalla no tiene recorrido, se deja la navegación.
  const guideIsPrimary = atDestination && Boolean(onStartTour)

  // Un recorrido por pantalla, nombrado por lo que hace: tutorial de los campos
  // en las pantallas con formulario, orientación de la navegación en el resto.
  const isFieldCoach = tourKind === 'coach'
  const guideLabel = resume
    ? t('help.resume')
    : t(isFieldCoach ? 'help.guideMeFields' : 'help.guideMe')
  const guideHint = resume
    ? t('help.resumeHint', { step: resume.step + 1, total: resume.total })
    : t(isFieldCoach ? 'help.guideMeFieldsHint' : 'help.guideMeHint')

  // Sólo se anuncia la ubicación de las pantallas que sabemos nombrar; para el
  // resto es mejor no decir nada que decir una clave de traducción.
  const viewNameKey = view ? `help.views.${view}` : null
  const viewName = viewNameKey ? t(viewNameKey) : null
  const showLocation = Boolean(viewName) && viewName !== viewNameKey

  // Quien ya se registró y no logra volver a entrar era el caso sin salida: el
  // panel le ofrecía "Crear mi cuenta" y nada más.
  const showLoginDoor = next.actionKey === 'account' && Boolean(onLogin)

  function runNextAction() {
    onClose()
    onRunNext?.()
  }

  function runTour() {
    onClose()
    onStartTour?.()
  }

  function goToLogin() {
    onClose()
    onLogin?.()
  }

  function goToContact() {
    onClose()
    onNavigate?.('contact')
  }

  return (
    <div className="help-panel__scrim" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        aria-describedby="help-panel-lead"
        onMouseDown={(event_) => event_.stopPropagation()}
      >
        <header className="help-panel__head">
          <p className="help-panel__eyebrow">{t('help.eyebrow')}</p>
          <h2 className="help-panel__title" id="help-panel-title">
            {t(journey.complete ? 'help.titleComplete' : 'help.title')}
          </h2>
          <p className="help-panel__lead" id="help-panel-lead">
            {t(journey.complete ? 'help.leadComplete' : 'help.lead')}
          </p>
          <button
            type="button"
            className="help-panel__close"
            aria-label={t('help.closeAria')}
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        {/* Cuerpo scrolleable: la CTA y las salidas quedan fijas abajo del
            diálogo para que el próximo paso no se pierda detrás del scroll. */}
        <div className="help-panel__body">
          {/* Ubicación e interruptor comparten la primera fila a propósito. El
              modo simple es la palanca más importante para el público al que
              apunta esta ayuda y antes quedaba al final de una lista con scroll:
              justo la gente que lo necesita no iba a llegar hasta ahí. */}
          <div className="help-panel__bar">
            {showLocation ? (
              <p className="help-panel__location">
                <MapPin size={14} strokeWidth={2} aria-hidden />
                <span>
                  {t('help.locationLabel')} <strong>{viewName}</strong>
                </span>
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="help-panel__assist"
              role="switch"
              aria-checked={assist}
              onClick={toggleAssist}
            >
              <Type size={14} strokeWidth={2} aria-hidden />
              <span className="help-panel__assist-label">{t('help.assist.title')}</span>
              <span className={`help-panel__switch${assist ? ' is-on' : ''}`} aria-hidden>
                <span className="help-panel__switch-knob" />
              </span>
            </button>
          </div>
          <p className="help-panel__assist-hint">
            {t(assist ? 'help.assist.activeHint' : 'help.assist.hint')}
          </p>

          <ol className="help-panel__steps" aria-label={t('help.stepsAria')}>
            {journey.steps.map((step) => (
              <li key={step.id} className={`help-panel__step is-${step.state}`}>
                <span className="help-panel__marker" aria-hidden>
                  {step.state === DONE ? <Check size={13} strokeWidth={3} /> : step.index}
                </span>
                <div className="help-panel__step-copy">
                  <p className="help-panel__step-head">
                    <span className="help-panel__step-title">{stepTitle(step, journey, t)}</span>
                    <span className="help-panel__step-state">{t(STATE_LABEL_KEY[step.state])}</span>
                  </p>
                  <p className="help-panel__step-detail">{stepDetail(step, journey, t, locale)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="help-panel__anchor">
          <div className="help-panel__action">
            <p className="help-panel__action-eyebrow">
              {t(guideIsPrimary ? 'help.hereEyebrow' : 'help.nextEyebrow')}
            </p>
            <button
              type="button"
              className="help-panel__cta"
              onClick={guideIsPrimary ? runTour : runNextAction}
            >
              <span>{guideIsPrimary ? guideLabel : t(ACTION_LABEL_KEY[next.actionKey])}</span>
              <ArrowRight size={15} strokeWidth={2.25} aria-hidden />
            </button>
            {guideIsPrimary ? <p className="help-panel__action-hint">{guideHint}</p> : null}

            {showLoginDoor ? (
              <p className="help-panel__door">
                <span>{t('help.haveAccountLabel')}</span>
                <button type="button" className="help-panel__door-link" onClick={goToLogin}>
                  {t('help.haveAccountAction')}
                  <ArrowRight size={13} strokeWidth={2.25} aria-hidden />
                </button>
              </p>
            ) : null}
          </div>

          <footer className="help-panel__foot">
            {onStartTour && !guideIsPrimary ? (
              <button type="button" className="help-panel__link" onClick={runTour}>
                <Compass size={15} aria-hidden />
                <span className="help-panel__link-copy">
                  <span className="help-panel__link-label">{guideLabel}</span>
                  <span className="help-panel__link-hint">{guideHint}</span>
                </span>
              </button>
            ) : null}

            <button
              type="button"
              className="help-panel__link help-panel__link--quiet"
              onClick={goToContact}
            >
              <MessageCircle size={15} aria-hidden />
              <span className="help-panel__link-copy">
                <span className="help-panel__link-label">{t('help.contact')}</span>
              </span>
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}
