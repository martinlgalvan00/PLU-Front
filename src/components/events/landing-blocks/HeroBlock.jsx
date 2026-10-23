import { ArrowLeft } from 'lucide-react'
import heroFallback from '../../../assets/DSC01606-display.webp'
import { eventPublicTitle } from '../../../lib/eventPublicSurface.js'
import { canBuyEventTickets, isEventRegistrationOpen } from '../../../lib/eventPublicActions.js'

/** Portada: imagen, logo, título, bajada y la acción que corresponda hoy. */
export default function HeroBlock({ block, ctx }) {
  const { event, landing, t, onNavigate, onSelectEvent, registrationEnabled } = ctx
  const title = landing.slots.heroTitle || eventPublicTitle(event) || event?.title || ''
  const lead = landing.slots.heroLead || event?.description || ''
  const registrationOpen = isEventRegistrationOpen(event, { registrationEnabled })
  const ticketsOpen = !registrationOpen && canBuyEventTickets(event)

  return (
    <header id={`bloque-${block.id}`} className="lb-hero">
      <img
        alt=""
        className="lb-hero__image"
        src={event?.heroImageUrl || heroFallback}
        fetchPriority="high"
      />
      <div className="lb-hero__shade" aria-hidden />
      <div className="lb-hero__inner">
        <button className="lb-hero__back" type="button" onClick={() => onNavigate?.('events')}>
          <ArrowLeft aria-hidden size={17} />
          {t('pages.eventBuilder.back')}
        </button>
        <div className="lb-hero__identity">
          {event?.logoUrl ? (
            <img alt="" className="lb-hero__logo" src={event.logoUrl} />
          ) : null}
          <p className="lb-hero__eyebrow">{t('pages.eventBuilder.eyebrow')}</p>
          <h1 className="lb-hero__title">{title}</h1>
          {lead ? <p className="lb-hero__lead">{lead}</p> : null}
          {registrationOpen ? (
            <button className="lb-button" type="button" onClick={() => onSelectEvent?.(event)}>
              {landing.slots.ctaLabel || t('pages.eventBuilder.register')}
            </button>
          ) : ticketsOpen ? (
            <button
              className="lb-button"
              type="button"
              onClick={() => onNavigate?.('tickets', { eventSlug: event.slug })}
            >
              {t('pages.eventBuilder.buyTickets')}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
