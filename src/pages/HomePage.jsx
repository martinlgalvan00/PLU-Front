import { m } from 'motion/react'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeMembershipBand from '../components/ui/HomeMembershipBand.jsx'
import HomeResultsTeaser from '../components/ui/HomeResultsTeaser.jsx'
import HomeRulebookTeaser from '../components/ui/HomeRulebookTeaser.jsx'
import HomeSupportStrip from '../components/ui/HomeSupportStrip.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StickyMobileCta from '../components/ui/StickyMobileCta.jsx'
import { getFeaturedEvent } from '../lib/eventNavigation.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'

const teaserDuoVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.18,
      delayChildren: 0.04,
    },
  },
}

export default function HomePage({ onNavigate, onSelectEvent, events = [], session, memberships = [] }) {
  const { reducedMotion } = useMotionConfig()
  const pitbullEvent = getFeaturedEvent(events)
  const isLoggedInAthlete = session?.role === 'athlete_plu'
  const hasActiveMembership = isLoggedInAthlete && memberships.some(
    (membership) => membership.athleteId === session.athleteId && membership.status === 'activa',
  )

  function handlePitbullRegister() {
    if (!isLoggedInAthlete) {
      onNavigate('register')
      return
    }
    onSelectEvent?.(pitbullEvent)
  }

  const TeaserDuo = reducedMotion ? 'div' : m.div
  const teaserDuoProps = reducedMotion
    ? { className: 'home-teaser-duo' }
    : {
        className: 'home-teaser-duo',
        variants: teaserDuoVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.28 },
      }

  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />

      <Reveal as="section" className="home-section home-section--canvas-light home-section--about" id="que-es" variant="fade">
        <div className="home-section__inner">
          <AboutSection />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--immersive home-section--pitbull-home" variant="from-right">
        <div className="home-section__inner">
          <PitbullSpotlight
            variant="home"
            event={pitbullEvent}
            onDetail={() => onNavigate?.('pitbull')}
            onRegister={handlePitbullRegister}
            onJoin={() => onNavigate?.('members')}
            onResults={() => onNavigate?.('results')}
          />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--mid-stack" variant="rise">
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
      </Reveal>

      <Reveal as="section" className="home-section home-section--immersive home-section--community" variant="scale">
        <div className="home-section__inner">
          <CommunitySpotlight onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--support" variant="fade">
        <div className="home-section__inner">
          <HomeSupportStrip onNavigate={onNavigate} />
        </div>
      </Reveal>

      <StickyMobileCta onNavigate={onNavigate} />
    </main>
  )
}
