import { ArrowLeft, Construction } from 'lucide-react'
import ConstructionScene from '../components/events/construction/ConstructionScene.jsx'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { eventPublicTitle } from '../lib/eventPublicSurface.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/event-under-construction.css'

/**
 * Lo que ve el público de una landing con el interruptor apagado. No lleva
 * datos del evento (el catálogo tampoco los entrega): solo el nombre y el aviso.
 */
export default function EventUnderConstructionPage({ event = null, onNavigate }) {
  const { t } = useI18n()
  const landing = eventLandingFromEvent(event)
  const title = landing.slots.heroTitle || eventPublicTitle(event) || event?.title || ''
  const motion = normalizeLandingMotion(landing.layout?.motion)

  return (
    <main
      className="page event-under-construction event-landing-theme"
      data-event-theme={landing.themeId}
      data-motion={motion}
      style={landingPaletteStyle(landing.layout)}
    >
      <div className="event-under-construction__inner">
        <button
          className="event-under-construction__back"
          type="button"
          onClick={() => onNavigate?.('events')}
        >
          <ArrowLeft aria-hidden size={17} />
          {t('pages.eventUnderConstruction.back')}
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
              {t('pages.eventUnderConstruction.lead')}
            </p>
            <button
              className="event-under-construction__cta"
              type="button"
              onClick={() => onNavigate?.('events')}
            >
              {t('pages.eventUnderConstruction.cta')}
            </button>
          </div>
          <ConstructionScene motion={motion} t={t} />
        </div>
      </div>
    </main>
  )
}
