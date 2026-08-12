import '../styles/pages/institutional-pages.css'
import '../styles/layout/design-page-notebook.css'
import { ArrowRight, Mail } from 'lucide-react'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  hasPublishedSponsors,
  listSponsorsByTier,
  SPONSOR_TIERS,
} from '../data/sponsors.js'

export default function SponsorsPage({ onNavigate }) {
  const { t } = useI18n()
  const published = hasPublishedSponsors()

  return (
    <main className="institutional-page sponsors-page--institutional">
      <InstitutionalPageHero
        breadcrumb={t('pages.sponsors.heroBreadcrumb')}
        description={t('pages.sponsors.heroDesc')}
        eyebrow={t('pages.sponsors.heroEyebrow')}
        index="S / 01"
        onHome={() => onNavigate?.('home')}
        title={t('pages.sponsors.heroTitle')}
      />

      <div className="institutional-page__inner">
        <Reveal variant="fade">
          <section className="institutional-manifesto" aria-labelledby="sponsors-intro-title">
            <p className="institutional-kicker">{t('pages.sponsors.introEyebrow')}</p>
            <h2 id="sponsors-intro-title">{t('pages.sponsors.introTitle')}</h2>
            <p>{t('pages.sponsors.introDesc')}</p>
          </section>
        </Reveal>

        <section className="sponsors-tiers" aria-labelledby="sponsors-tiers-title">
          <header className="institutional-section-head">
            <p className="institutional-kicker">02 / {t('pages.sponsors.tiersEyebrow')}</p>
            <div>
              <h2 id="sponsors-tiers-title">{t('pages.sponsors.tiersTitle')}</h2>
              <p>{t('pages.sponsors.tiersDesc')}</p>
            </div>
          </header>

          <ul className="sponsors-tiers__list">
            {SPONSOR_TIERS.map((tier) => {
              const partners = listSponsorsByTier(tier)
              return (
                <li key={tier} className="sponsors-tiers__item">
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
                </li>
              )
            })}
          </ul>
          {!published ? (
            <p className="sponsors-tiers__catalog-note">{t('pages.sponsors.catalogNote')}</p>
          ) : null}
        </section>

        <Reveal delay={40}>
          <div className="institutional-cta-row">
            <button type="button" className="institutional-cta" onClick={() => onNavigate?.('contact')}>
              <Mail size={16} aria-hidden />
              <span>{t('pages.sponsors.ctaContact')}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
            <button type="button" className="institutional-cta institutional-cta--ghost" onClick={() => onNavigate?.('events')}>
              <span>{t('pages.sponsors.ctaCalendar')}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </Reveal>
      </div>
    </main>
  )
}
