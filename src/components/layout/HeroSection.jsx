import heroImage from '../../assets/PLU Argentina.jpg'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import CTAButton from '../ui/CTAButton.jsx'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()

  const secondaryLinks = [
    ['events', t('hero.ctaEvents')],
    ['results', t('nav.results')],
    ['login', t('hero.ctaLogin')],
  ]

  return (
    <section className="hero" style={{ '--hero-image': `url(${heroImage})` }}>
      <div className="hero__glow" aria-hidden="true" />
      <div className="hero__grain" aria-hidden="true" />
      <div className="hero__overlay" />
      <div className="hero__content">
        <span className="hero__eyebrow">{t('hero.eyebrow')}</span>
        <h1 className="hero__title">
          {t('hero.title')}
          <span>{t('hero.subtitle')}</span>
        </h1>
        <p className="hero__subtitle">{t('hero.description')}</p>

        <div className="hero__actions">
          <div className="hero__actions-primary">
            <CTAButton onClick={() => onNavigate('register')}>{t('hero.ctaRegister')}</CTAButton>
            <CTAButton variant="celeste" onClick={() => onNavigate('pitbull')}>
              {t('hero.ctaPitbull')}
            </CTAButton>
          </div>
          <div className="hero__actions-secondary">
            {secondaryLinks.map(([view, label]) => (
              <button key={view} type="button" className="hero__quick-link" onClick={() => onNavigate(view)}>
                {label}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
