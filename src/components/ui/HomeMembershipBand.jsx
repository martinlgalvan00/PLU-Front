import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import Button from './Button.jsx'
import HomeMembershipCredential from './HomeMembershipCredential.jsx'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const copyContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
}

const copyItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

/** Metadata de temporada — entrada más sutil que el resto: es información
 * secundaria, no debe competir con el título ni el CTA. */
const copyItemSubtle = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

export default function HomeMembershipBand({ onNavigate, isLoggedInAthlete = false, hasActiveMembership = false }) {
  const { HOME_MEMBERSHIP, HOME_MEMBERSHIP_FEATURES } = useContent()
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  /** El CTA principal responde al estado real de la sesión — nunca invita a
   * "ver planes" a quien ya está afiliado, ni a "afiliarse" sin haber
   * iniciado sesión (ahí primero necesita crear su perfil de atleta). */
  const primaryCta = isLoggedInAthlete
    ? hasActiveMembership
      ? t('pages.members.ctaAlreadyAffiliated')
      : t('pages.members.ctaAuthenticated')
    : HOME_MEMBERSHIP.cta
  const primaryTarget = isLoggedInAthlete ? (hasActiveMembership ? 'profile' : 'membership') : 'members'
  const goToAffiliation = () => onNavigate(primaryTarget)

  const CopyShell = reducedMotion ? 'div' : m.div
  const copyProps = reducedMotion
    ? { className: 'home-membership-band__copy' }
    : {
        className: 'home-membership-band__copy',
        variants: copyContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true, amount: 0.35 },
      }

  const CopyItem = reducedMotion ? 'div' : m.div
  const itemProps = reducedMotion ? {} : { variants: copyItem }
  const subtleItemProps = reducedMotion ? {} : { variants: copyItemSubtle }

  return (
    <div className="home-membership-band home-membership-band--editorial">
      <CopyShell {...copyProps}>
        <CopyItem {...itemProps} className="home-membership-band__eyebrow">
          {HOME_MEMBERSHIP.eyebrow}
        </CopyItem>

        <CopyItem {...itemProps}>
          <h2 className="home-membership-band__title">
            <span className="home-membership-band__title-lead">{HOME_MEMBERSHIP.titleLead}</span>
            <span className="home-membership-band__title-accent">{HOME_MEMBERSHIP.titleAccent}</span>
          </h2>
        </CopyItem>

        <CopyItem {...itemProps} className="home-membership-band__desc">
          {HOME_MEMBERSHIP.description}
        </CopyItem>

        {HOME_MEMBERSHIP_FEATURES?.length ? (
          <CopyItem {...itemProps}>
            <ul className="home-membership-band__benefits" aria-label={t('pages.home.membershipBenefitsAria')}>
              {HOME_MEMBERSHIP_FEATURES.map((feature, index) => (
                <CopyItem key={feature} role="listitem" {...itemProps} className="home-membership-band__benefit">
                  <span className="home-membership-band__benefit-index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="home-membership-band__benefit-text">{feature}</span>
                </CopyItem>
              ))}
            </ul>
          </CopyItem>
        ) : null}

        <CopyItem {...itemProps} className="home-membership-band__actions">
          <button type="button" className="home-membership-band__cta" onClick={goToAffiliation}>
            {primaryCta}
            <ArrowRight size={15} aria-hidden className="home-membership-band__cta-icon" />
          </button>
          <button
            type="button"
            className="home-membership-band__cta-secondary"
            onClick={() => onNavigate('events')}
          >
            {t('pages.home.viewCalendar')}
          </button>
        </CopyItem>

        <CopyItem {...subtleItemProps}>
          <p className="home-membership-band__meta" aria-label={t('pages.home.membershipMetaAria')}>
            <span>{HOME_MEMBERSHIP.seasonNote}</span>
            <span aria-hidden className="home-membership-band__meta-sep">
              ·
            </span>
            <span>{HOME_MEMBERSHIP.planLabel}</span>
          </p>
        </CopyItem>
      </CopyShell>

      {/* Spine entre copy y credencial — el grid es copy | spine | card */}
      <span className="home-membership-band__spine" aria-hidden />

      <HomeMembershipCredential />
    </div>
  )
}
