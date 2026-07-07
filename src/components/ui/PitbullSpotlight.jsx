import { ArrowRight } from 'lucide-react'
import pitbullVisual from '../../assets/powerlifting-hero.png'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'

export default function PitbullSpotlight({
  variant = 'card',
  onDetail,
  onRegister,
  registerLabel,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const resolvedRegisterLabel = registerLabel ?? t('pages.events.register')
  const isHome = variant === 'home'
  const isEvents = variant === 'events'

  if (isEvents) {
    return (
      <article className="pitbull-spotlight pitbull-spotlight--events pitbull-spotlight--editorial">
        <div className="pitbull-spotlight__stripe" aria-hidden />

        <div className="pitbull-spotlight__layout">
          <figure className="pitbull-spotlight__media">
            <img
              src={pitbullVisual}
              alt=""
              className="pitbull-spotlight__media-img"
              loading="lazy"
              decoding="async"
            />
          </figure>

          <div className="pitbull-spotlight__panel">
            <header className="pitbull-spotlight__head">
              <span className="pitbull-spotlight__index" aria-hidden>
                {t('pages.events.spotlightIndex')}
              </span>
              <div className="pitbull-spotlight__head-copy">
                <span className="pitbull-spotlight__eyebrow">{t('pages.events.nextMeet')}</span>
                <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
                <p className="pitbull-spotlight__meta">
                  <time dateTime="2026-12-12">{PITBULL_CLASSIC.date}</time>
                  <span aria-hidden>·</span>
                  <span>{PITBULL_CLASSIC.venue}</span>
                  <span aria-hidden>·</span>
                  <span>{PITBULL_CLASSIC.location}</span>
                </p>
                <p className="pitbull-spotlight__lead">{PITBULL_CLASSIC.tagline}</p>
              </div>
            </header>

            <footer className="pitbull-spotlight__foot">
              <span className="pitbull-spotlight__status">{t('pages.pitbull.spotlight.registrationSoon')}</span>
              <div className="pitbull-spotlight__actions">
                <button type="button" className="pitbull-spotlight__link" onClick={onDetail}>
                  {t('pages.pitbull.spotlight.viewDetail')}
                  <ArrowRight size={14} aria-hidden />
                </button>
                {onRegister ? <Button onClick={onRegister}>{resolvedRegisterLabel}</Button> : null}
              </div>
            </footer>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article
      className={`pitbull-spotlight ${isHome ? 'pitbull-spotlight--home' : 'pitbull-spotlight--design'}`}
    >
      <div className={`pitbull-spotlight__copy ${isHome ? 'pitbull-spotlight__copy--accent' : ''}`}>
        <span className="pitbull-spotlight__eyebrow">
          {!isHome && <span className="pitbull-spotlight__eyebrow-dot" aria-hidden />}
          {t('pages.pitbull.spotlight.nextEvent')}
        </span>
        <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
        <p className="pitbull-spotlight__desc">{PITBULL_CLASSIC.tagline}</p>

        {isHome ? (
          <div className="pitbull-spotlight__meta">
            <span>
              {PITBULL_CLASSIC.date}{' '}
              <small>· {t('pages.pitbull.spotlight.sampleData')}</small>
            </span>
            <span>
              {PITBULL_CLASSIC.location}{' '}
              <small>· {t('pages.pitbull.spotlight.sampleData')}</small>
            </span>
          </div>
        ) : (
          <ul className="pitbull-spotlight__meta">
            <li>
              {PITBULL_CLASSIC.date}
            </li>
            <li>
              {PITBULL_CLASSIC.location}
            </li>
          </ul>
        )}

        {!isHome && (
          <>
            <div className="pitbull-spotlight__tags">
              {PITBULL_CLASSIC.categories.map((category) => (
                <span key={category} className="pitbull-spotlight__tag">
                  {category}
                </span>
              ))}
            </div>

            <div className="pitbull-spotlight__capacity">
              <CapacityBar
                current={PITBULL_CLASSIC.registered}
                total={PITBULL_CLASSIC.slots}
                label={t('pages.pitbull.spotlight.slotsOccupied')}
              />
            </div>
          </>
        )}

        <div className="pitbull-spotlight__actions">
          {isHome ? (
            <>
              <button type="button" className="pitbull-spotlight__cta-primary" onClick={onDetail}>
                {t('pages.events.viewPitbull')}
              </button>
              <span className="pitbull-spotlight__soon">
                {t('pages.pitbull.spotlight.registrationSoon')}
              </span>
            </>
          ) : (
            <>
              <Button onClick={onDetail}>{t('pages.events.viewPitbull')}</Button>
              {onRegister ? (
                <Button variant="outline" onClick={onRegister}>
                  {resolvedRegisterLabel}
                </Button>
              ) : (
                <span className="pitbull-spotlight__soon">
                  <span className="pitbull-spotlight__soon-dot" aria-hidden />
                  {t('pages.pitbull.spotlight.registrationSoon')}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`pitbull-spotlight__visual ${isHome ? 'pitbull-spotlight__visual--home pitbull-spotlight__visual--placeholder' : ''}`} aria-hidden>
        {isHome ? (
          <>
            <div className="pitbull-spotlight__visual-overlay" />
            <span className="pitbull-spotlight__badge">{t('pages.pitbull.spotlight.featured')}</span>
            <span className="pitbull-spotlight__visual-caption">{t('pages.pitbull.spotlight.podiumCaption')}</span>
          </>
        ) : (
          <>
            <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
            <div className="pitbull-spotlight__visual-overlay" />
            <span className="pitbull-spotlight__badge">{t('pages.pitbull.spotlight.featured')}</span>
            <div className="pitbull-spotlight__visual-date">
              <span className="pitbull-spotlight__visual-date-day">{PITBULL_CLASSIC.dateDay}</span>
              <span className="pitbull-spotlight__visual-date-month">{PITBULL_CLASSIC.dateMonth} 2026</span>
            </div>
          </>
        )}
      </div>
    </article>
  )
}
