import { m } from 'motion/react'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeMembershipBand from '../components/ui/HomeMembershipBand.jsx'
import HomeResultsTeaser from '../components/ui/HomeResultsTeaser.jsx'
import HomeRulebookTeaser from '../components/ui/HomeRulebookTeaser.jsx'
import LaunchRegistrationTeaser from '../components/ui/LaunchRegistrationTeaser.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StickyMobileCta from '../components/ui/StickyMobileCta.jsx'
import { useContent } from '../hooks/useContent.js'
import { useEventRegistrationCapacity } from '../hooks/useEventRegistrationCapacity.js'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
  getPitbullClassicEvent,
} from '../lib/eventNavigation.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { hasCurrentMembership } from '../services/membershipService.js'

const teaserDuoVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.16,
      delayChildren: 0.04,
    },
  },
}

export default function HomePage({
  onNavigate,
  onSelectEvent,
  events = [],
  session,
  memberships = [],
}) {
  const { reducedMotion } = useMotionConfig()
  const { PITBULL_CLASSIC } = useContent()
  const launchEvent = getPitbullClassicEvent(events) ?? getFeaturedEvent(events)
  const featuredDestination = getFeaturedEventDestination(launchEvent)
  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const hasActiveMembership =
    isLoggedInAthlete && hasCurrentMembership(memberships, session.athleteId)
  const {
    status: capacityStatus,
    registered: liveRegistered,
    slots: liveSlots,
    recent: recentRegistrants,
  } = useEventRegistrationCapacity(launchEvent?.slug ?? 'pitbull-classic-2026', {
    // El contador solo refresca mientras la banda del torneo está a la vista:
    // en el resto del scroll de la landing no hay polling.
    observeRoot: 'torneo-destacado',
    fallbackRegistered: PITBULL_CLASSIC.registered,
    fallbackSlots: PITBULL_CLASSIC.slots,
  })

  function handlePitbullRegister() {
    onSelectEvent?.(launchEvent)
  }

  function openFeaturedEvent() {
    onNavigate?.(featuredDestination.view, featuredDestination.options)
  }

  const TeaserDuo = reducedMotion ? 'div' : m.div
  const teaserDuoProps = reducedMotion
    ? { className: 'home-teaser-duo' }
    : {
        className: 'home-teaser-duo',
        variants: teaserDuoVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.22 },
      }

  const paidCheckoutOpen = isPaidCheckoutOpen(launchEvent, env)
  const isRegistrationDisabled =
    !paidCheckoutOpen || !launchEvent || launchEvent.status === 'proximamente'

  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      {isRegistrationDisabled ? (
        <section
          className="home-section home-section--immersive home-section--launch"
          id="apertura-inscripciones"
        >
          <div className="home-section__inner">
            <LaunchRegistrationTeaser event={launchEvent} onNavigate={onNavigate} variant="hero" />
          </div>
        </section>
      ) : null}

      <section className="home-section home-section--immersive home-section--about" id="que-es">
        <div className="home-section__inner">
          <AboutSection onNavigate={onNavigate} />
        </div>
      </section>

      <section
        className="home-section home-section--immersive home-section--pitbull-home home-section--pitbull-bleed"
        id="torneo-destacado"
      >
        <div className="home-section__inner home-section__inner--bleed">
          <PitbullSpotlight
            variant="home"
            capacityStatus={capacityStatus}
            event={launchEvent}
            onDetail={openFeaturedEvent}
            onRegister={handlePitbullRegister}
            onJoin={() => onNavigate?.('members')}
            onResults={() => onNavigate?.('results')}
            recent={recentRegistrants}
            registered={liveRegistered}
            slots={liveSlots}
          />
        </div>
      </section>

      <section className="home-section home-section--canvas-light home-section--mid-stack">
        <div className="home-section__inner home-mid-stack">
          <HomeMembershipBand
            onNavigate={onNavigate}
            isLoggedInAthlete={isLoggedInAthlete}
            hasActiveMembership={hasActiveMembership}
            gateEvent={launchEvent}
          />

          <div className="home-mid-stack__divider" aria-hidden />

          <TeaserDuo {...teaserDuoProps}>
            <HomeResultsTeaser onNavigate={onNavigate} orchestrated={!reducedMotion} />
            <HomeRulebookTeaser onNavigate={onNavigate} orchestrated={!reducedMotion} />
          </TeaserDuo>
        </div>
      </section>

      <section className="home-section home-section--immersive home-section--community">
        <Reveal className="home-section__inner" variant="fade">
          <CommunitySpotlight onNavigate={onNavigate} />
        </Reveal>
      </section>

      <StickyMobileCta onNavigate={onNavigate} />
    </main>
  )
}
