import { m } from 'motion/react'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeCalendarTeaser from '../components/ui/HomeCalendarTeaser.jsx'
import HomeMembershipBand from '../components/ui/HomeMembershipBand.jsx'
import HomeResultsTeaser from '../components/ui/HomeResultsTeaser.jsx'
import HomeRulebookTeaser from '../components/ui/HomeRulebookTeaser.jsx'
import LaunchRegistrationTeaser from '../components/ui/LaunchRegistrationTeaser.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StickyMobileCta from '../components/ui/StickyMobileCta.jsx'
import { useContent } from '../hooks/useContent.js'
import { useEventRegistrationCapacity } from '../hooks/useEventRegistrationCapacity.js'
import { getFeaturedEvent, getFeaturedEventDestination } from '../lib/eventNavigation.js'
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

export default function HomePage({ onNavigate, onSelectEvent, events = [], session, memberships = [] }) {
  const { reducedMotion } = useMotionConfig()
  const { PITBULL_CLASSIC } = useContent()
  const pitbullEvent = getFeaturedEvent(events)
  const featuredDestination = getFeaturedEventDestination(pitbullEvent)
  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const hasActiveMembership = isLoggedInAthlete && hasCurrentMembership(memberships, session.athleteId)
  const { registered: liveRegistered, slots: liveSlots } = useEventRegistrationCapacity(
    pitbullEvent?.slug ?? 'pitbull-classic-2026',
    {
      fallbackRegistered: PITBULL_CLASSIC.registered,
      fallbackSlots: PITBULL_CLASSIC.slots,
    },
  )

  function handlePitbullRegister() {
    onSelectEvent?.(pitbullEvent)
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

  const isRegistrationDisabled = !pitbullEvent || pitbullEvent.status === 'proximamente'

  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      {isRegistrationDisabled ? (
        <section className="home-section home-section--immersive home-section--launch">
          <div className="home-section__inner">
            <LaunchRegistrationTeaser
              event={pitbullEvent}
              onNavigate={onNavigate}
              variant="full"
            />
          </div>
        </section>
      ) : null}

      <section className="home-section home-section--immersive home-section--about" id="que-es">
        <div className="home-section__inner">
          <AboutSection onNavigate={onNavigate} />
        </div>
      </section>

      <section className="home-section home-section--immersive home-section--pitbull-home">
        <div className="home-section__inner">
          <PitbullSpotlight
            variant="home"
            event={pitbullEvent}
            onDetail={openFeaturedEvent}
            onRegister={handlePitbullRegister}
            onJoin={() => onNavigate?.('members')}
            onResults={() => onNavigate?.('results')}
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
          />

          <div className="home-mid-stack__divider" aria-hidden />

          <TeaserDuo {...teaserDuoProps}>
            <HomeResultsTeaser onNavigate={onNavigate} orchestrated={!reducedMotion} />
            <HomeRulebookTeaser onNavigate={onNavigate} orchestrated={!reducedMotion} />
          </TeaserDuo>
        </div>
      </section>

      <section className="home-section home-section--immersive home-section--calendar">
        <div className="home-section__inner">
          <HomeCalendarTeaser
            events={events}
            onNavigate={onNavigate}
            onSelectEvent={onSelectEvent}
            session={session}
          />
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
