import { ArrowRight } from 'lucide-react'
import Button from './Button.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import TiltCard from '../../motion/TiltCard.tsx'

function scrollToId(id) {
  const target = document.getElementById(id)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function MembersPluHero({
  onNavigate,
  session,
  affiliationCta,
  ctaDisabled,
  onAffiliate,
}) {
  const { t } = useI18n()
  const { MEMBERSHIP_CREDENTIAL_SAMPLE } = useContent()
  const isLoggedInAthlete = session?.role === 'athlete_plu'

  const quickLinks = [
    { id: 'afiliarme', label: t('pages.members.quickNavAffiliate'), onClick: () => scrollToId('planes') },
    { id: 'cuenta', label: t('pages.members.quickNavAccount'), onClick: () => onNavigate('login') },
    { id: 'comunidad', label: t('pages.members.quickNavCommunity'), onClick: () => onNavigate('community') },
    { id: 'reglamento', label: t('pages.members.quickNavRulebook'), onClick: () => onNavigate('rulebook') },
    { id: 'faq', label: t('pages.members.quickNavFaq'), onClick: () => scrollToId('members-faq') },
  ]

  return (
    <header className="members-plu-hero">
      <div className="members-plu-hero__grid">
        <div className="members-plu-hero__main">
          <p className="members-plu-hero__chapter">
            <span className="members-plu-hero__chapter-dot" aria-hidden />
            {t('pages.members.heroChapter')}
          </p>
          <h1 className="members-plu-hero__title">
            <span className="members-plu-hero__title-line">{t('pages.members.heroTitleLead')}</span>
            <span className="members-plu-hero__title-line members-plu-hero__title-line--accent">
              {t('pages.members.heroTitleAccent')}
            </span>
          </h1>
          <p className="members-plu-hero__desc">{t('pages.members.heroDesc')}</p>

          <div className="members-plu-hero__cta-row">
            <Button variant="gold" disabled={ctaDisabled} onClick={onAffiliate}>
              {affiliationCta}
            </Button>
            <Button variant="outline" onClick={() => scrollToId('requisitos')}>
              {t('pages.members.heroCtaSecondary')}
            </Button>
          </div>

          <div className="members-plu-hero__account">
            {isLoggedInAthlete ? (
              <p className="members-plu-hero__signed-in">
                {t('pages.members.heroSignedIn', { name: session?.name ?? session?.email ?? '' })}
              </p>
            ) : (
              <>
                <span className="members-plu-hero__account-label">{t('pages.members.existingMember')}</span>
                <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('login')}>
                  {t('pages.members.loginLink')}
                </button>
                <span className="members-plu-hero__account-sep" aria-hidden>
                  ·
                </span>
                <button type="button" className="members-plu-hero__account-link" onClick={() => onNavigate('register')}>
                  {t('pages.members.registerLink')}
                </button>
              </>
            )}
          </div>
        </div>

        <TiltCard
          className="members-plu-hero__card-tilt"
          innerClassName="members-plu-hero__card members-plu-hero__card-inner"
        >
          <aside aria-label={t('pages.members.credentialPreviewLabel')}>
            <p className="members-plu-hero__card-label">{t('pages.members.credentialPreviewLabel')}</p>
            <dl className="members-plu-hero__card-rows">
              <div className="members-plu-hero__card-row">
                <dt>{t('pages.members.credentialAthleteLabel')}</dt>
                <dd>{MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}</dd>
              </div>
              <div className="members-plu-hero__card-row">
                <dt>{t('pages.members.credentialCodeLabel')}</dt>
                <dd className="members-plu-hero__card-code">{MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}</dd>
              </div>
              <div className="members-plu-hero__card-row">
                <dt>{t('pages.members.credentialSeasonLabel')}</dt>
                <dd>{MEMBERSHIP_CREDENTIAL_SAMPLE.season}</dd>
              </div>
              <div className="members-plu-hero__card-row">
                <dt>{t('pages.members.credentialStatusLabel')}</dt>
                <dd>{MEMBERSHIP_CREDENTIAL_SAMPLE.status}</dd>
              </div>
            </dl>
            <p className="members-plu-hero__card-note">{t('pages.members.credentialPreviewNote')}</p>
          </aside>
        </TiltCard>
      </div>

      <nav className="members-plu-quicknav" aria-label={t('pages.members.quickNavAria')}>
        {quickLinks.map((link, index) => (
          <span key={link.id} className="members-plu-quicknav__item">
            {index > 0 && <span className="members-plu-quicknav__sep" aria-hidden>/</span>}
            <button type="button" className="members-plu-quicknav__link" onClick={link.onClick}>
              {link.label}
            </button>
          </span>
        ))}
      </nav>
    </header>
  )
}
