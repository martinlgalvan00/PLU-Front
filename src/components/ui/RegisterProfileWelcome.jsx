import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import ConfirmationSeal from './ConfirmationSeal.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider'
import { MOTION_EASE } from '../../motion/tokens'

/* Misma secuencia one-shot que RegisterMembershipConfirmation: el sello abre,
   los pasos entran detrás. Bajo prefers-reduced-motion no se monta ningún
   nodo animado. */
const SEQUENCE = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
}

const RISE = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: MOTION_EASE.out } },
}

const STEP_KEYS = [1, 2, 3]

/**
 * Pantalla de bienvenida tras crear la cuenta: confirma el alta y explica,
 * en tres pasos fijos y siempre visibles (no un disclosure — acá el atleta
 * ya está en el momento dedicado a leerlo), cómo va a volver a entrar y qué
 * va a encontrar en su panel. Un solo CTA: no compite con la oferta de
 * afiliación/inscripción, que ya vive en el estado vacío de la credencial.
 */
export default function RegisterProfileWelcome({ athleteName, onNavigate }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const firstName = athleteName?.trim().split(' ')[0] || ''

  const Section = reducedMotion ? 'section' : m.section
  const Block = reducedMotion ? 'div' : m.div
  const sequenceProps = reducedMotion
    ? {}
    : { variants: SEQUENCE, initial: 'hidden', animate: 'visible' }
  const riseProps = reducedMotion ? {} : { variants: RISE }

  return (
    <Section
      className="register-profile-welcome"
      aria-labelledby="register-profile-welcome-title"
      {...sequenceProps}
    >
      <h2 id="register-profile-welcome-title" className="visually-hidden">
        {t('pages.register.profileWelcomeTitle')}
      </h2>

      <Block className="register-profile-welcome__seal" {...riseProps}>
        <ConfirmationSeal
          variant="account"
          eyebrow={t('pages.register.sealProfileEyebrow')}
          title={
            firstName
              ? t('pages.register.sealProfileHello', { name: firstName })
              : t('pages.register.sealProfileTitle')
          }
        />
      </Block>

      <Block className="register-profile-welcome__steps" {...riseProps}>
        <ol className="register-profile-welcome__list">
          {STEP_KEYS.map((step) => (
            <li key={step} className="register-profile-welcome__step">
              <span className="register-profile-welcome__step-n" aria-hidden>
                {String(step).padStart(2, '0')}
              </span>
              <div className="register-profile-welcome__step-copy">
                <p className="register-profile-welcome__step-title">
                  {t(`pages.register.profileWelcomeStep${step}Title`)}
                </p>
                <p className="register-profile-welcome__step-body">
                  {t(`pages.register.profileWelcomeStep${step}Body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Block>

      <Block {...riseProps}>
        <button
          type="button"
          className="register-membership-confirmation__cta register-membership-confirmation__cta--primary"
          onClick={() => onNavigate?.('profile')}
        >
          {t('pages.register.profileWelcomeCta')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </Block>
    </Section>
  )
}
