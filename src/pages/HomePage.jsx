import { useContent } from '../hooks/useContent.js'
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

export default function HomePage({ onNavigate, onSelectEvent, events = [], session, memberships = [] }) {
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

          <div className="home-teaser-duo">
            <HomeResultsTeaser onNavigate={onNavigate} />
            <HomeRulebookTeaser onNavigate={onNavigate} />
          </div>
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
