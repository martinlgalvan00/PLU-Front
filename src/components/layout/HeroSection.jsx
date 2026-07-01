import heroImage from '../../assets/PLU Argentina.jpg'
import { ArrowRight, ChevronDown, Trophy, UserPlus } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HeroSection({ onNavigate }) {
  const { t } = useI18n()

  const quickLinks = [
    ['events', t('hero.ctaEvents')],
    ['members', t('nav.members')],
    ['results', t('nav.results')],
    ['login', t('hero.ctaLogin')],
  ]

  return (
    <section className="hero" style={{ '--hero-image': `url(${heroImage})` }}>
      {/* Capas de profundidad */}
      <div className="hero__overlay" />
      <div className="hero__glow" aria-hidden />
      <div className="hero__glow-gold" aria-hidden />

      {/* Líneas decorativas futuristas */}
      <div className="hero__grid-lines" aria-hidden>
        <span /><span /><span /><span />
      </div>

      <div className="hero__content">
        {/* Eyebrow con indicador de estado */}
        <div className="hero__eyebrow">
          <span className="hero__eyebrow-dot" aria-hidden />
          {t('hero.eyebrow')}
        </div>

        <h1 className="hero__title">
          {t('hero.title')}
          <span className="hero__title-sub">{t('hero.subtitle')}</span>
        </h1>

        <p className="hero__subtitle">{t('hero.description')}</p>

        <div className="hero__action-panel">
          <div className="hero__action-cards">
            <button
              type="button"
              className="hero__action-card hero__action-card--primary"
              onClick={() => onNavigate('register')}
            >
              <span className="hero__action-card__icon" aria-hidden>
                <UserPlus size={20} strokeWidth={2.25} />
              </span>
              <span className="hero__action-card__body">
                <strong>{t('hero.ctaRegister')}</strong>
                <span>{t('hero.ctaRegisterHint')}</span>
              </span>
              <ArrowRight size={18} className="hero__action-card__arrow" aria-hidden />
            </button>

            <button
              type="button"
              className="hero__action-card hero__action-card--event"
              onClick={() => onNavigate('pitbull')}
            >
              <span className="hero__action-card__icon hero__action-card__icon--gold" aria-hidden>
                <Trophy size={20} strokeWidth={2.25} />
              </span>
              <span className="hero__action-card__body">
                <strong>{t('hero.ctaPitbullShort')}</strong>
                <span>{t('hero.ctaPitbullHint')}</span>
              </span>
              <span className="hero__action-card__badge">{t('hero.ctaPitbullAction')}</span>
              <ArrowRight size={18} className="hero__action-card__arrow hero__action-card__arrow--event" aria-hidden />
            </button>
          </div>

          <nav className="hero__quick-nav" aria-label={t('hero.quickNavLabel')}>
            {quickLinks.map(([view, label]) => (
              <button
                key={view}
                type="button"
                className="hero__quick-chip"
                onClick={() => onNavigate(view)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="hero__scroll-hint" aria-hidden>
        <ChevronDown size={16} />
      </div>
    </section>
  )
}
