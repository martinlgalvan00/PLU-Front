import { useState } from 'react'
import { AlertTriangle, ArrowRight, Trophy } from 'lucide-react'
import PitbullBrandMark from '../../components/ui/PitbullBrandMark.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { EVENT_STATUS } from '../../lib/events.js'
import { isPitbullClassicEvent } from '../../lib/eventNavigation.js'
import { resolveComboDeal, resolveEventPricing } from '../../lib/eventPricing.js'
import { money } from '../../lib/format.js'
import { isMembershipCurrent } from '../../services/membershipService.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import {
  findAthleteEventRegistration,
  isPendingRegistration,
} from '../../lib/athleteEventStatus.js'
import { isRegistrationAdmitted } from '../../lib/status.js'
import { getEventComboAvailability } from '../../services/comboOfferService.js'
import FinancedDebtNotice from '../../components/ui/FinancedDebtNotice.jsx'

function eventRequiresMembership(event) {
  return Boolean(event?.requiresMembership)
}

export default function UpcomingEventsSection({
  availableEvents,
  athleteRegistrations,
  membership,
  onNavigate,
  onSelectEvent,
  athlete,
  onNavigateSection,
  checkoutAvailability = {},
  // Orden financiada abierta. Sólo interesa si otorgó una inscripción: una
  // afiliación financiada se avisa en su propia ficha, no debajo de un torneo.
  pendingFinancedPayment = null,
}) {
  const { locale, t } = useI18n()
  const hasActiveMembership = isMembershipCurrent(membership)
  // El combo otorga las dos cosas; una afiliación suelta no otorga ninguna
  // inscripción, así que su deuda no se cuenta acá.
  const financedRegistration = ['registration', 'combo'].includes(
    pendingFinancedPayment?.conceptType,
  )
    ? pendingFinancedPayment
    : null
  const registrationCheckoutEnabled = checkoutAvailability.registrationEnabled !== false
  const [incompleteWarningEvent, setIncompleteWarningEvent] = useState(null)

  function goToRegistration(event) {
    // `onSelectEvent` fija el evento de la fila clickeada antes de navegar;
    // sin él, el wizard podía quedarse con el `selectedEvent` global viejo.
    if (onSelectEvent) {
      onSelectEvent(event)
      return
    }
    onNavigate('competition')
  }

  function handleRegisterClick(event) {
    if (!registrationCheckoutEnabled) return
    if (!athlete) {
      goToRegistration(event)
      return
    }
    const profileStatus = isProfileComplete(athlete)
    if (!profileStatus.complete) {
      setIncompleteWarningEvent(event.slug)
      return
    }
    setIncompleteWarningEvent(null)
    goToRegistration(event)
  }

  function handleGoToProfile() {
    setIncompleteWarningEvent(null)
    if (onNavigateSection) {
      onNavigateSection('account-personal-data')
    }
  }

  // Labels legibles de los campos requeridos faltantes
  const FIELD_LABELS = {
    phone: t('account.personalData.phone'),
    city: t('account.personalData.city'),
    province: t('account.personalData.province'),
    gym: t('account.personalData.gym'),
  }

  function getMissingFieldsLabel() {
    if (!athlete) return ''
    const { missing } = isProfileComplete(athlete)
    return missing.map((f) => FIELD_LABELS[f] ?? f).join(', ')
  }

  return (
    <section id="account-events" className="account-section account-section--events">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold" aria-hidden>
          <Trophy size={21} strokeWidth={1.75} />
        </div>
        <div>
          <span>{t('account.events.eyebrow')}</span>
          <h2>{t('account.events.title')}</h2>
        </div>
      </div>

      {/* Banner global de perfil incompleto (aparece cuando se toca inscribirse sin perfil completo) */}
      {incompleteWarningEvent && (
        <div className="account-inline-alert" role="alert">
          <div className="account-inline-alert__icon">
            <AlertTriangle size={18} aria-hidden />
          </div>
          <div className="account-inline-alert__body">
            <strong>{t('account.events.profileIncompleteTitle')}</strong>
            <p>{t('account.events.profileIncompleteBody', { fields: getMissingFieldsLabel() })}</p>
          </div>
          <button type="button" className="account-inline-alert__action" onClick={handleGoToProfile}>
            {t('account.events.profileIncompleteAction')}
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      )}

      {availableEvents.length ? (
        <div className="account-events-list">
          {availableEvents.map((event) => {
            // Slug primero y sin contar canceladas: ver
            // `findAthleteEventRegistration`. La comparación por título que
            // había acá dejaba de reconocer la inscripción en cuanto el staff
            // renombraba el meet, y contaba como vigente una cancelada.
            const registration = findAthleteEventRegistration(athleteRegistrations, {
              athleteId: athlete?.id,
              event,
            })
            const registered = isRegistrationAdmitted(registration?.status)
            const paymentPending = isPendingRegistration(registration)
            const registrationState = registered
              ? 'registered'
              : paymentPending
                ? 'pending_payment'
                : 'open'
            const needsMembership = eventRequiresMembership(event)
            const membershipPending = needsMembership && !hasActiveMembership
            const isPitbull = isPitbullClassicEvent(event)
            const profileStatus = athlete ? isProfileComplete(athlete) : { complete: true }
            const showingWarningForThis = incompleteWarningEvent === event.slug
            const comboAvailability = membershipPending
              ? getEventComboAvailability(event, { hasActiveMembership: false })
              : { offer: null, enabled: false }
            const comboDeal = comboAvailability.offer
              ? resolveComboDeal({
                  ...resolveEventPricing(event),
                  combo: comboAvailability.offer.price,
                })
              : null
            const showComboNote = comboAvailability.enabled && comboDeal?.live

            return (
              <article
                key={event.slug}
                className={`account-events-list__row${showingWarningForThis ? ' is-warning-active' : ''}`}
              >
                <time dateTime={event.dateISO}>{event.date}</time>
                <div className="account-events-list__body">
                  {isPitbull ? (
                    <>
                      <PitbullBrandMark size="sm" label={event.title} />
                      <h3 className="visually-hidden">{event.title}</h3>
                    </>
                  ) : (
                    <h3>{event.title}</h3>
                  )}
                  <p>
                    {event.venue} · {event.location}
                  </p>
                  {showComboNote ? (
                    <p className="account-event-membership-note account-event-membership-note--combo">
                      {t('account.events.comboAvailableText', {
                        amount: money(comboDeal.savings, locale),
                      })}
                    </p>
                  ) : membershipPending ? (
                    <p className="account-event-membership-note">
                      {t('account.events.membershipRequiredText')}
                    </p>
                  ) : null}
                  {/* "Inscripto" puede serlo por financiamiento: la deuda se
                      dice debajo de la inscripción que sostiene, no en otra
                      pantalla. Sólo en la fila que está admitida — es la única
                      donde el aviso significa algo. */}
                  {registered && financedRegistration ? (
                    <FinancedDebtNotice
                      payment={financedRegistration}
                      scope="registration"
                      onSettle={() => onNavigateSection?.('account-payments')}
                    />
                  ) : null}
                </div>
                <span className="account-event-status" data-state={registrationState}>
                  {registered
                    ? membershipPending
                      ? t('account.qr.gateReserved')
                      : t('account.events.registered')
                    : paymentPending
                      ? t('account.events.paymentPending')
                      : EVENT_STATUS[event.status]?.label}
                </span>
                <button
                  type="button"
                  className={`account-events-list__cta${registered ? ' is-registered' : ''}${paymentPending ? ' is-payment-pending' : ''}${!profileStatus.complete && !registered ? ' is-profile-incomplete' : ''}`}
                  onClick={() => !registered && handleRegisterClick(event)}
                  disabled={registered || !registrationCheckoutEnabled}
                  aria-describedby={
                    showingWarningForThis ? 'account-profile-incomplete-warning' : undefined
                  }
                >
                  {registered
                    ? t('account.events.alreadyRegistered', { event: event.title })
                    : !registrationCheckoutEnabled
                      ? t('pages.members.ctaCheckoutSoon')
                      : paymentPending
                        ? t('account.events.resumePayment')
                        : t('account.events.register')}
                </button>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="account-section__empty">{t('account.events.empty')}</p>
      )}
    </section>
  )
}
