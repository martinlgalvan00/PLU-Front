import { useContent } from '../hooks/useContent.js'
import AboutSection from '../components/ui/AboutSection.jsx'
import CommunitySpotlight from '../components/ui/CommunitySpotlight.jsx'
import HeroSection from '../components/layout/HeroSection.jsx'
import HomeMembershipBand from '../components/ui/HomeMembershipBand.jsx'
import HomeResultsTeaser from '../components/ui/HomeResultsTeaser.jsx'
import HomeRulebookTeaser from '../components/ui/HomeRulebookTeaser.jsx'
import FAQAccordion from '../components/ui/FAQAccordion.jsx'
import PitbullSpotlight from '../components/ui/PitbullSpotlight.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function HomePage({ onNavigate }) {
  const { HOME_FAQ, HOME_FAQ_ITEMS, MEMBERSHIP_PLANS } = useContent()
  const athletePlan = MEMBERSHIP_PLANS.find((plan) => plan.id === 'athlete') ?? MEMBERSHIP_PLANS[0]

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
          <PitbullSpotlight variant="home" onDetail={() => onNavigate('pitbull')} />
        </div>
      </Reveal>

      <Reveal as="section" className="home-section home-section--canvas-light home-section--mid-stack" variant="fade">
        <div className="home-section__inner home-mid-stack">
          <HomeMembershipBand plan={athletePlan} onNavigate={onNavigate} />

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

      <Reveal as="section" className="home-section home-section--canvas-light home-section--faq" variant="fade">
        <div className="home-section__inner">
          <div className="home-faq">
            <div className="home-faq__intro">
              <SectionHeading
                align="left"
                variant="ref"
                eyebrow={HOME_FAQ.eyebrow}
                title={HOME_FAQ.title}
                description={HOME_FAQ.description}
              />
              <div className="home-faq__quick-links">
                {HOME_FAQ.quickLinks.map(({ label, view }) => (
                  <button
                    key={view}
                    type="button"
                    className="home-faq__quick-link"
                    onClick={() => onNavigate(view)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="home-faq__panel">
              <FAQAccordion items={HOME_FAQ_ITEMS} variant="ref" numbered />
              <div className="home-faq__footer">
                <button type="button" className="home-faq__more" onClick={() => onNavigate('faq')}>
                  {HOME_FAQ.cta}
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </main>
  )
}
