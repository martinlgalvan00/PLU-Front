import '../styles/pages/institutional-pages.css'
import '../styles/pages/sponsors.css'
import '../styles/pages/sponsors-luxe.css'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import EditorialLedger from '../components/ui/EditorialLedger.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SponsorInquiryForm, { SPONSOR_BRAND_FIELD_ID } from '../components/ui/SponsorInquiryForm.jsx'
import SponsorsAudience from '../components/ui/SponsorsAudience.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { hasPublishedSponsors, listSponsorsByTier, SPONSOR_TIERS } from '../data/sponsors.js'
import { normalizeSponsorTier, SPONSOR_TIER_UNDECIDED } from '../lib/sponsorInquiry.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import TiltCard from '../motion/TiltCard.tsx'
import { MOTION_VIEWPORT } from '../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../motion/variants.ts'

const PROPOSAL_SECTION_ID = 'propuesta'
const TIERS_SECTION_ID = 'niveles'

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function scrollToSection(id) {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

export default function SponsorsPage({ onNavigate }) {
  const { messages, t } = useI18n()
  const { reducedMotion, tier: motionTier } = useMotionConfig()
  const still = reducedMotion || motionTier === 'low'
  const TierList = still ? 'ul' : m.ul
  const TierItem = still ? 'li' : m.li
  const tierListProps = still
    ? {}
    : {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
        variants: staggerContainer,
      }
  const [interestTier, setInterestTier] = useState(SPONSOR_TIER_UNDECIDED)
  const published = hasPublishedSponsors()
  const benefits = Array.isArray(messages.pages?.sponsors?.benefits)
    ? messages.pages.sponsors.benefits
    : []
  const processSteps = Array.isArray(messages.pages?.sponsors?.process)
    ? messages.pages.sponsors.process
    : []

  function openProposal(tier = SPONSOR_TIER_UNDECIDED) {
    setInterestTier(normalizeSponsorTier(tier))
    scrollToSection(PROPOSAL_SECTION_ID)
    requestAnimationFrame(() => {
      document.getElementById(SPONSOR_BRAND_FIELD_ID)?.focus({ preventScroll: true })
    })
  }

  return (
    <main className="institutional-page sponsors-page--institutional">
      <InstitutionalPageHero
        actions={
          <>
            <button
              type="button"
              className="sponsors-cta sponsors-cta--primary"
              onClick={() => openProposal()}
            >
              <span>{t('pages.sponsors.heroCta')}</span>
              <ArrowRight size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="sponsors-cta sponsors-cta--link"
              onClick={() => scrollToSection(TIERS_SECTION_ID)}
            >
              <span>{t('pages.sponsors.heroCtaTiers')}</span>
            </button>
          </>
        }
        breadcrumb={t('pages.sponsors.heroBreadcrumb')}
        description={t('pages.sponsors.heroDesc')}
        eyebrow={t('pages.sponsors.heroEyebrow')}
        index="S / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.sponsors.heroTitle')}
      />

      <div className="institutional-page__inner sponsors-page__inner">
        <Reveal variant="fade">
          <SponsorsAudience />
        </Reveal>

        <Reveal variant="fade">
          <section className="institutional-manifesto" aria-labelledby="sponsors-intro-title">
            <p className="institutional-kicker">{t('pages.sponsors.introEyebrow')}</p>
            <h2 id="sponsors-intro-title">{t('pages.sponsors.introTitle')}</h2>
            <p>{t('pages.sponsors.introDesc')}</p>
          </section>
        </Reveal>

        <section className="sponsors-benefits" aria-labelledby="sponsors-benefits-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.sponsors.benefitsEyebrow')}</p>
            <div>
              <h2 id="sponsors-benefits-title">{t('pages.sponsors.benefitsTitle')}</h2>
              <p>{t('pages.sponsors.benefitsDesc')}</p>
            </div>
          </header>

          <EditorialLedger items={benefits} ariaLabel={t('pages.sponsors.benefitsTitle')} />
        </section>

        <section
          className="sponsors-tiers"
          id={TIERS_SECTION_ID}
          aria-labelledby="sponsors-tiers-title"
        >
          <header className="institutional-section-head">
            <p className="institutional-kicker">03 / {t('pages.sponsors.tiersEyebrow')}</p>
            <div>
              <h2 id="sponsors-tiers-title">{t('pages.sponsors.tiersTitle')}</h2>
              <p>{t('pages.sponsors.tiersDesc')}</p>
            </div>
          </header>

          <TierList className="sponsor-tiers__grid" {...tierListProps}>
            {SPONSOR_TIERS.map((tier) => {
              const partners = listSponsorsByTier(tier)
              return (
                <TierItem
                  key={tier}
                  className={`sponsor-tier${tier === 'title' ? ' sponsor-tier--title' : ''}`}
                  {...(still ? {} : { variants: staggerItem })}
                >
                  <TiltCard
                    className="sponsor-tier__tilt"
                    innerClassName="tilt-card__inner sponsor-tier__plate"
                    maxTilt={tier === 'title' ? 3 : 4}
                  >
                    <p className="sponsor-tier__label">{t(`pages.sponsors.tiers.${tier}.label`)}</p>
                    <h3>{t(`pages.sponsors.tiers.${tier}.title`)}</h3>
                    <p className="sponsor-tier__desc">{t(`pages.sponsors.tiers.${tier}.desc`)}</p>
                    {partners.length > 0 ? (
                      <ul className="sponsor-tier__partners">
                        {partners.map((partner) => (
                          <li key={partner.id}>
                            {partner.logoSrc ? (
                              <img src={partner.logoSrc} alt="" className="sponsor-tier__logo" />
                            ) : null}
                            {partner.url ? (
                              <a href={partner.url} target="_blank" rel="noopener noreferrer">
                                {partner.name}
                              </a>
                            ) : (
                              <strong>{partner.name}</strong>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sponsor-tier__empty">{t('pages.sponsors.slotEmpty')}</p>
                    )}
                    <button
                      type="button"
                      className="sponsor-tier__cta motion-icon-shift"
                      onClick={() => openProposal(tier)}
                    >
                      <span>{t('pages.sponsors.tierCta')}</span>
                      <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
                    </button>
                  </TiltCard>
                </TierItem>
              )
            })}
          </TierList>
          {!published ? (
            <p className="sponsors-tiers__catalog-note">{t('pages.sponsors.catalogNote')}</p>
          ) : null}
        </section>

        <section className="sponsors-process" aria-labelledby="sponsors-process-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">04 / {t('pages.sponsors.processEyebrow')}</p>
            <div>
              <h2 id="sponsors-process-title">{t('pages.sponsors.processTitle')}</h2>
              <p>{t('pages.sponsors.processDesc')}</p>
            </div>
          </header>

          <EditorialLedger rail items={processSteps} ariaLabel={t('pages.sponsors.processTitle')} />
        </section>

        <Reveal delay={40}>
          <section
            className="sponsors-proposal"
            id={PROPOSAL_SECTION_ID}
            aria-labelledby="sponsors-form-title"
          >
            <header className="sponsors-proposal__copy">
              <p className="institutional-kicker">05 / {t('pages.sponsors.form.eyebrow')}</p>
              <h2 id="sponsors-form-title">{t('pages.sponsors.form.title')}</h2>
              <p>{t('pages.sponsors.form.lead')}</p>
            </header>
            <SponsorInquiryForm tier={interestTier} onTierChange={setInterestTier} />
          </section>
        </Reveal>
      </div>
    </main>
  )
}
