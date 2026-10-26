import { ArrowLeft, CalendarDays, Construction, MapPin } from 'lucide-react'
import ConstructionScene from '../components/events/construction/ConstructionScene.jsx'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { isEventRegistrationOpen } from '../lib/eventPublicActions.js'
import { eventPublicTitle } from '../lib/eventPublicSurface.js'
import { hiddenLandingTakesRegistrations } from '../../shared/registrationSaleState.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/event-under-construction.css'

function formatDate(value, locale, withTime = false) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

/**
 * Lo que ve el público de una landing con el interruptor apagado: el nombre del
 * evento y el aviso de que la página oficial se está construyendo.
 *
 * Ocultar la página no cierra la venta: con la inscripción abierta el aviso
 * lleva "Inscribirme" (y la fecha y sede, que el catálogo entrega solo en ese
 * caso); programada, dice cuándo abre. Cerrada, no revela nada más.
 */
export default function EventUnderConstructionPage({
  event = null,
  // A dónde lleva "Volver": la portada si se llegó desde su carril.
  backView = 'events',
  onNavigate,
  onSelectEvent,
  registrationEnabled = true,
}) {
  const { t, locale } = useI18n()
  const landing = eventLandingFromEvent(event)
  const title = landing.slots.heroTitle || eventPublicTitle(event) || event?.title || ''
  const motion = normalizeLandingMotion(landing.layout?.motion)
  const takesRegistrations = hiddenLandingTakesRegistrations(event)
  const canRegister =
    takesRegistrations &&
    Boolean(onSelectEvent) &&
    isEventRegistrationOpen(event, { registrationEnabled })
  const opensAt =
    takesRegistrations && !canRegister ? formatDate(event?.registrationOpensAt, locale, true) : ''
  const date = takesRegistrations ? formatDate(event?.startsAt, locale) : ''
  const place = takesRegistrations
    ? [event?.venue, event?.location].filter(Boolean).join(' · ')
    : ''

  return (
    <main
      className="page event-under-construction event-landing-theme"
      data-event-theme={landing.themeId}
      data-motion={motion}
      data-registration={canRegister ? 'open' : opensAt ? 'scheduled' : 'closed'}
      style={landingPaletteStyle(landing.layout)}
    >
      <div className="event-under-construction__inner">
        <button
          className="event-under-construction__back"
          type="button"
          onClick={() => onNavigate?.(backView)}
        >
          <ArrowLeft aria-hidden size={17} />
          {backView === 'home'
            ? t('pages.eventUnderConstruction.backHome')
            : t('pages.eventUnderConstruction.back')}
        </button>

        <div className="event-under-construction__layout">
          <div className="event-under-construction__body">
            <p className="event-under-construction__eyebrow">
              <Construction aria-hidden size={16} />
              {t('pages.eventUnderConstruction.eyebrow')}
            </p>
            {title ? <h1 className="event-under-construction__event">{title}</h1> : null}
            <h2 className="event-under-construction__title" role="status">
              {t('pages.eventUnderConstruction.title')}
            </h2>
            <p className="event-under-construction__lead">
              {title
                ? t('pages.eventUnderConstruction.leadNamed', { event: title })
                : t('pages.eventUnderConstruction.lead')}
            </p>

            {date || place ? (
              <dl className="event-under-construction__facts">
                {date ? (
                  <div>
                    <dt>
                      <CalendarDays aria-hidden size={15} />
                      {t('pages.eventUnderConstruction.date')}
                    </dt>
                    <dd>{date}</dd>
                  </div>
                ) : null}
                {place ? (
                  <div>
                    <dt>
                      <MapPin aria-hidden size={15} />
                      {t('pages.eventUnderConstruction.venue')}
                    </dt>
                    <dd>{place}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {canRegister ? (
              <>
                <p className="event-under-construction__registration">
                  {t('pages.eventUnderConstruction.registrationOpen')}
                </p>
                <div className="event-under-construction__actions">
                  <button
                    className="event-under-construction__cta"
                    type="button"
                    onClick={() => onSelectEvent(event)}
                  >
                    {t('pages.eventUnderConstruction.register')}
                  </button>
                  <button
                    className="event-under-construction__secondary"
                    type="button"
                    onClick={() => onNavigate?.('events')}
                  >
                    {t('pages.eventUnderConstruction.cta')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {opensAt ? (
                  <p className="event-under-construction__registration">
                    {t('pages.eventUnderConstruction.registrationScheduled', { date: opensAt })}
                  </p>
                ) : null}
                <button
                  className="event-under-construction__cta"
                  type="button"
                  onClick={() => onNavigate?.('events')}
                >
                  {t('pages.eventUnderConstruction.cta')}
                </button>
              </>
            )}
          </div>
          <ConstructionScene motion={motion} t={t} />
        </div>
      </div>
    </main>
  )
}
