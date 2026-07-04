import {
  ABOUT_PILLARS,
  HOME_FAQ,
  HOME_FAQ_ITEMS,
  MEMBERSHIP_PLANS,
} from '../lib/content.js'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeMembershipBand from '../components/ui/HomeMembershipBand.jsx'
import HomeQuickBand from '../components/ui/HomeQuickBand.jsx'
import HomeResultsTeaser from '../components/ui/HomeResultsTeaser.jsx'
import HomeRulebookTeaser from '../components/ui/HomeRulebookTeaser.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

const ATHLETE_PLAN = MEMBERSHIP_PLANS.find((plan) => plan.id === 'athlete') ?? MEMBERSHIP_PLANS[0]

export default function HomePage({ onNavigate }) {
  return (
    <main className="home-page">
      <HeroSection onNavigate={onNavigate} />
      <HomeQuickBand onNavigate={onNavigate} />

      <Reveal as="section" className="home-section home-section--canvas-light home-section--about" id="que-es" variant="fade">
        <div className="home-section__inner">
          <AboutSection pillars={ABOUT_PILLARS} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--immersive home-section--pitbull-home" variant="from-right">
        <div className="home-section__inner">
          <PitbullSpotlight variant="home" onDetail={() => onNavigate('pitbull')} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--membership" variant="scale">
        <div className="home-section__inner">
          <HomeMembershipBand plan={ATHLETE_PLAN} onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--surface home-section--results" variant="fade">
        <div className="home-section__inner">
          <HomeResultsTeaser onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--rulebook" variant="fade">
        <div className="home-section__inner">
          <HomeRulebookTeaser onNavigate={onNavigate} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--immersive home-section--community" variant="scale">
        <CommunitySpotlight onNavigate={onNavigate} />
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--faq" variant="fade">
        <div className="home-section__inner home-section__inner--narrow">
          <SectionHeading
            align="center"
            variant="ref"
            eyebrow={HOME_FAQ.eyebrow}
            title={HOME_FAQ.title}
          />
          <FAQAccordion items={HOME_FAQ_ITEMS} variant="ref" />
          <div className="home-faq__footer">
            <button type="button" className="home-faq__more" onClick={() => onNavigate('faq')}>
              Ver todas las preguntas →
            </button>
          </div>
        </div>
      </Reveal>
    </main>
  )
}
