import { ArrowRight, BadgeCheck, CalendarDays } from 'lucide-react'
import { m } from 'motion/react'
import TiltCard from '../../motion/TiltCard.tsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

/** Entrada protagonista: la credencial es el momento visual principal de la
 * sección, así que usa la duración/ease "cinematográficos" (los mismos que
 * el hero) en vez del ritmo editorial más corto del resto del bloque. */
const cardEnter = {
  hidden: { opacity: 0, y: 24, rotate: -1.4, scale: 0.985, filter: 'blur(5px)' },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic, delay: 0.1 },
  },
}

/**
 * Showcase de afiliación — credencial conceptual (sin datos personales
 * inventados), estado, temporada real y acceso al calendario oficial.
 * Reutiliza el lenguaje visual de la credencial de MembersPage
 * (TiltCard + capas glow/grain/watermark/stripe) adaptado a esta sección.
 */
export default function HomeMembershipCredential({ onNavigate }) {
  const { HOME_MEMBERSHIP, HOME_MEMBERSHIP_FEATURES } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const seasonYear = HOME_MEMBERSHIP.seasonNote.match(/\d+/)?.[0] ?? ''
  const resultsHighlight = HOME_MEMBERSHIP_FEATURES?.[2]

  const Shell = reducedMotion ? 'div' : m.div
  const shellProps = reducedMotion
    ? { className: 'home-credential' }
    : {
        className: 'home-credential',
        variants: cardEnter,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.4 },
      }

  return (
    <Shell {...shellProps}>
      <TiltCard
        className="home-credential__tilt"
        innerClassName="tilt-card__inner home-credential__card"
        maxTilt={3}
      >
        <div className="home-credential__stack" aria-label={t('pages.home.credentialAria')}>
          <span className="home-credential__plates" aria-hidden />
          <span className="home-credential__glow" aria-hidden />
          <span className="home-credential__grain" aria-hidden />
          <span className="home-credential__watermark" aria-hidden>
            {seasonYear.slice(-2)}
          </span>
          <span className="home-credential__stripe" aria-hidden />

          <div className="home-credential__layer">
            <header className="home-credential__head">
              <p className="home-credential__brand">PLU</p>
              <span className="home-credential__chip" aria-hidden>
                <span className="home-credential__chip-shine" />
              </span>
            </header>

            <div className="home-credential__identity">
              <p className="home-credential__preview-label">{t('pages.home.credentialPreviewLabel')}</p>
              <span className="home-credential__name-placeholder" aria-hidden />
            </div>

            <dl className="home-credential__meta">
              <div className="home-credential__meta-item">
                <dt>{t('pages.home.credentialSeasonLabel')}</dt>
                <dd>{HOME_MEMBERSHIP.seasonNote}</dd>
              </div>
              <div className="home-credential__meta-item home-credential__meta-item--status">
                <dt>{t('pages.home.credentialStatusLabel')}</dt>
                <dd>
                  <BadgeCheck size={13} aria-hidden className="home-credential__status-icon" />
                  {t('pages.home.credentialStatusValue')}
                </dd>
              </div>
            </dl>

            <div className="home-credential__footer">
              {resultsHighlight ? <p className="home-credential__note-inline">{resultsHighlight}</p> : <span />}
              <button
                type="button"
                className="home-credential__calendar-link"
                onClick={() => onNavigate('events')}
              >
                <CalendarDays size={13} aria-hidden />
                <span>{t('pages.home.credentialCalendarLabel')}</span>
                <ArrowRight className="home-credential__calendar-arrow" size={13} aria-hidden />
              </button>
            </div>

            <p className="home-credential__note">{t('pages.home.credentialPreviewNote')}</p>
          </div>
        </div>
      </TiltCard>
    </Shell>
  )
}
