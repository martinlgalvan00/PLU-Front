import { ArrowRight, Calendar, MapPin } from 'lucide-react'
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
      <article className="pitbull-spotlight pitbull-spotlight--design pitbull-spotlight--events">
        <div className="pitbull-spotlight__content">
          <div className="pitbull-spotlight__top">
            <span className="pitbull-spotlight__eyebrow">{t('pages.pitbull.spotlight.nextEvent')}</span>
            <span className="pitbull-spotlight__soon">
              <span className="pitbull-spotlight__soon-dot" aria-hidden />
              {t('pages.pitbull.spotlight.registrationSoon')}
            </span>
          </div>

          <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
          <p className="pitbull-spotlight__desc">{PITBULL_CLASSIC.tagline}</p>

          <div className="pitbull-spotlight__meta-rail">
            <span className="pitbull-spotlight__meta-item">
              <Calendar size={13} aria-hidden />
              {PITBULL_CLASSIC.date}
            </span>
            <span className="pitbull-spotlight__meta-sep" aria-hidden>
              ·
            </span>
            <span className="pitbull-spotlight__meta-item">
              <MapPin size={13} aria-hidden />
              {PITBULL_CLASSIC.location}
            </span>
          </div>

          <div className="pitbull-spotlight__footer">
            <div className="pitbull-spotlight__footer-main">
              <span className="pitbull-spotlight__categories">
                {PITBULL_CLASSIC.categories.join(' · ')}
              </span>
              <div className="pitbull-spotlight__capacity pitbull-spotlight__capacity--compact">
                <CapacityBar
                  current={PITBULL_CLASSIC.registered}
                  total={PITBULL_CLASSIC.slots}
                  label={t('pages.pitbull.slots')}
                />
              </div>
            </div>
            <div className="pitbull-spotlight__actions">
              <Button variant="outline" onClick={onDetail}>
                {t('pages.pitbull.spotlight.viewDetail')}
              </Button>
              {onRegister ? (
                <Button onClick={onRegister}>{resolvedRegisterLabel}</Button>
              ) : (
                <button type="button" className="pitbull-spotlight__cta-link" onClick={onDetail}>
                  {t('pages.pitbull.spotlight.fullCalendar')}
                  <ArrowRight size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="pitbull-spotlight__visual pitbull-spotlight__visual--minimal" aria-hidden>
          <img src={pitbullVisual} alt="" className="pitbull-spotlight__visual-img" />
          <div className="pitbull-spotlight__visual-overlay" />
          <div className="pitbull-spotlight__visual-date pitbull-spotlight__visual-date--compact">
            <span className="pitbull-spotlight__visual-date-day">{PITBULL_CLASSIC.dateDay}</span>
            <span className="pitbull-spotlight__visual-date-month">{PITBULL_CLASSIC.dateMonth} 2026</span>
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
              <Calendar size={14} aria-hidden />
              {PITBULL_CLASSIC.date}
            </li>
            <li>
              <MapPin size={14} aria-hidden />
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
