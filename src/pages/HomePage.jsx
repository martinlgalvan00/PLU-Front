import { m } from 'motion/react'
import { useCallback, useRef, useState } from 'react'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeGuideSheet from '../components/ui/HomeGuideSheet.jsx'
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
import { hasSeenHomeGuide, markHomeGuideSeen } from '../lib/homeGuideStorage.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { MOTION_TIER_SCALE } from '../motion/tokens.ts'
import { hasCurrentMembership } from '../services/membershipService.js'

/** Cascada de entrada del dúo de teasers, escalada por tier de dispositivo:
 * en equipos limitados se acorta (no desaparece) para que el contenido
 * termine de asentarse antes. Ver src/motion/deviceTier.ts. */
function getTeaserDuoVariants(tierScale) {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.16 * tierScale,
        delayChildren: 0.04 * tierScale,
      },
    },
  }
}

export default function HomePage({
  onNavigate,
  onSelectEvent,
  events = [],
  session,
  memberships = [],
  checkoutAvailability = {},
}) {
  const { reducedMotion, tier } = useMotionConfig()
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
        variants: getTeaserDuoVariants(MOTION_TIER_SCALE[tier]),
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.22 },
      }

  const registrationCheckoutEnabled = checkoutAvailability.registrationEnabled !== false
  const paidCheckoutOpen =
    registrationCheckoutEnabled &&
    isPaidCheckoutOpen(launchEvent, env, new Date(), { checkoutKind: 'registration' })
  const isRegistrationDisabled =
    !paidCheckoutOpen || !launchEvent || launchEvent.status === 'proximamente'
  const [guideOpen, setGuideOpen] = useState(false)
  const guideAutoOpenedRef = useRef(false)

  const closeGuide = useCallback(() => {
    markHomeGuideSeen()
    setGuideOpen(false)
  }, [])

  const openGuide = useCallback(() => {
    setGuideOpen(true)
  }, [])

  const handleStickyVisible = useCallback(() => {
    if (guideAutoOpenedRef.current || isLoggedInAthlete || hasSeenHomeGuide()) return
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(max-width: 640px)').matches) {
      return
    }
    guideAutoOpenedRef.current = true
    setGuideOpen(true)
  }, [isLoggedInAthlete])

  const goToAffiliation = useCallback(() => {
    markHomeGuideSeen()
    setGuideOpen(false)
    onNavigate?.('members')
  }, [onNavigate])

  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      {isRegistrationDisabled ? (
        <section
          className="home-section home-section--immersive home-section--launch"
          id="apertura-inscripciones"
        >
          <div className="home-section__inner">
            <LaunchRegistrationTeaser
              event={launchEvent}
              onNavigate={onNavigate}
              registrationCheckoutEnabled={registrationCheckoutEnabled}
              variant="hero"
            />
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
            registrationCheckoutEnabled={registrationCheckoutEnabled}
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
            onSelectEvent={onSelectEvent}
            isLoggedInAthlete={isLoggedInAthlete}
            hasActiveMembership={hasActiveMembership}
            gateEvent={launchEvent}
            checkoutAvailability={checkoutAvailability}
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

      <StickyMobileCta
        guideOpen={guideOpen}
        onBecameVisible={handleStickyVisible}
        onNavigate={goToAffiliation}
        onOpenGuide={openGuide}
      />
      {guideOpen ? (
        <HomeGuideSheet onAffiliate={goToAffiliation} onClose={closeGuide} />
      ) : null}
    </main>
  )
}
