import '../styles/pages/institutional-pages.css'
import '../styles/pages/sponsors.css'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SponsorInquiryForm, { SPONSOR_BRAND_FIELD_ID } from '../components/ui/SponsorInquiryForm.jsx'
import SponsorsAudience from '../components/ui/SponsorsAudience.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { hasPublishedSponsors, listSponsorsByTier, SPONSOR_TIERS } from '../data/sponsors.js'
import { normalizeSponsorTier, SPONSOR_TIER_UNDECIDED } from '../lib/sponsorInquiry.js'

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

          <ol className="sponsors-benefits__list">
            {benefits.map((item, index) => (
              <li key={item.id} className="sponsors-benefits__item">
                <span className="sponsors-benefits__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="sponsors-benefits__body">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
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

          <ul className="sponsors-tiers__list">
            {SPONSOR_TIERS.map((tier) => {
              const partners = listSponsorsByTier(tier)
              return (
                <li
                  key={tier}
                  className={`sponsors-tiers__item${tier === 'title' ? ' sponsors-tiers__item--title' : ''}`}
                >
                  <p className="sponsors-tiers__label">{t(`pages.sponsors.tiers.${tier}.label`)}</p>
                  <h3>{t(`pages.sponsors.tiers.${tier}.title`)}</h3>
                  <p>{t(`pages.sponsors.tiers.${tier}.desc`)}</p>
                  {partners.length > 0 ? (
                    <ul className="sponsors-tiers__partners">
                      {partners.map((partner) => (
                        <li key={partner.id}>
                          {partner.logoSrc ? (
                            <img src={partner.logoSrc} alt="" className="sponsors-tiers__logo" />
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
                    <p className="sponsors-tiers__empty">{t('pages.sponsors.slotEmpty')}</p>
                  )}
                  <button
                    type="button"
                    className="sponsors-tiers__cta"
                    onClick={() => openProposal(tier)}
                  >
                    <span>{t('pages.sponsors.tierCta')}</span>
                    <ArrowRight size={13} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
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

          <ol className="sponsors-process__list">
            {processSteps.map((step, index) => (
              <li key={step.id} className="sponsors-process__item">
                <span className="sponsors-process__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="sponsors-process__body">
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
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
