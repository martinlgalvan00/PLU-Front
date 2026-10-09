import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useMemo } from 'react'
import heroPhoto from '../../assets/DSC00346-display.jpg'
import heroPhotoAvif from '../../assets/DSC00346-display.avif'
import heroPhotoAvif640 from '../../assets/DSC00346-display-640.avif'
import heroPhotoAvif1280 from '../../assets/DSC00346-display-1280.avif'
import heroPhotoWebp from '../../assets/DSC00346-display.webp'
import heroPhotoWebp640 from '../../assets/DSC00346-display-640.webp'
import heroPhotoWebp1280 from '../../assets/DSC00346-display-1280.webp'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import ResponsivePhoto from '../ui/ResponsivePhoto.jsx'
import { env } from '../../config/env.js'
import TiltCard from '../../motion/TiltCard.tsx'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import { useMagneticHover } from '../../motion/useMagneticHover.ts'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { isTicketSalesEnabled } from '../../lib/eventPricing.js'
import { isPaidCheckoutOpen } from '../../lib/registrationSchedule.js'
import { isRegistrationOpen } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER_BY_TIER,
  SHOWCASE_TILT_MAX_DEG,
} from '../../motion/tokens.ts'
import {
  heroActionsItem,
  heroProofItem,
  heroSequenceItem,
  heroTitleLine,
} from '../../motion/variants.ts'

/** Título del hero: cada línea sube desde debajo de una máscara (wipe editorial).
 * El clip usa insets negativos en % para no recortar descendentes ni la panza
 * de la G (ver `.hero__title--design`). Todas las unidades son % para que
 * Motion pueda interpolar. En touch se conserva el fade+rise de `heroTitleLine`
 * porque clip-path pesa en la GPU de mobile. */
const heroTitleLineWipe = {
  hidden: { clipPath: 'inset(100% 0% 0% 0%)', opacity: 0, y: '38%' },
  visible: {
    clipPath: 'inset(-12% -12% -28% -12%)',
    opacity: 1,
    y: '0%',
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
  },
}

export default function HeroSection({ onNavigate, event }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const magneticProps = useMagneticHover()
  const titleLineVariants = useMemo(
    () => (tier !== 'low' && hasFinePointer() ? heroTitleLineWipe : heroTitleLine),
    [tier],
  )
  const eventStatus = event?.status ?? 'proximamente'
  const registrationCheckoutOpen = isPaidCheckoutOpen(event, env, new Date(), {
    checkoutKind: 'registration',
  })
  const registrationAvailable = registrationCheckoutOpen && isRegistrationOpen(eventStatus)
  // Mismo interruptor que PitbullSpotlight: si el evento vende entradas, el
  // hero no puede seguir diciendo "Cerrado" (eso es la inscripción de atletas).
  const ticketsAvailable = env.ticketSalesEnabled && isTicketSalesEnabled(event)
  const statusLabelOverride = ticketsAvailable
    ? t('hero.statusTicketsOpen')
    : registrationAvailable
      ? t('hero.statusRegistrationOpen')
      : undefined
  // Cascada propia del hero (no la heroStaggerContainer compartida con
  // Tickets/PluPageHero/PitbullHero) para escalarla por tier de dispositivo
  // sin afectar esas otras páginas. Ver src/motion/deviceTier.ts.
  const heroStagger = useMemo(() => {
    const { step, delayChildren } = MOTION_STAGGER_BY_TIER[tier]
    return {
      hidden: {},
      visible: { transition: { staggerChildren: step, delayChildren } },
    }
  }, [tier])

  const kicker = (
    <>
      <span className="hero__kicker-dot" aria-hidden />
      {t('hero.kicker')}
    </>
  )

  const titleLines = (
    <>
      <span className="hero__title-line">{t('hero.titleLead')}</span>{' '}
      <span className="hero__title-line hero__title-line--accent">{t('hero.titleAccent')}</span>
    </>
  )

  const animatedTitle = (
    <>
      <m.span className="hero__title-line" variants={titleLineVariants}>
        {t('hero.titleLead')}
      </m.span>{' '}
      <m.span
        className="hero__title-line hero__title-line--accent"
        variants={titleLineVariants}
      >
        {t('hero.titleAccent')}
      </m.span>
    </>
  )

  const rule = reducedMotion ? (
    <span className="hero__rule motif-rule" aria-hidden />
  ) : (
    <m.span
      className="hero__rule motif-rule"
      aria-hidden
      variants={{
        hidden: { scaleX: 0 },
        visible: {
          scaleX: 1,
          transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.cinematic },
        },
      }}
    />
  )

  // "Afiliate. Competí. Resultados oficiales." se lee como tres tiempos: cada
  // frase en su propia línea tipográfica, separadas por reglas finas.
  const leadBeats = t('hero.description')
    .split(/(?<=\.)\s+/)
    .filter(Boolean)
  const lead = (
    <span className="hero__lead-text hero__lead-text--beats">
      {leadBeats.map((beat) => (
        <span key={beat} className="hero__lead-beat">
          {beat}
        </span>
      ))}
    </span>
  )

  const proofCard = (
    <HeroStatusCard
      event={event}
      onSelect={() => onNavigate('pitbull')}
      onSelectTickets={
        ticketsAvailable
          ? () => onNavigate('tickets', { eventSlug: event?.slug ?? event?.id })
          : undefined
      }
      statusLabelOverride={statusLabelOverride}
      ticketsAvailable={ticketsAvailable}
    />
  )
  // La ficha del meet es la única pieza 3D del primer viewport; la credencial
  // de afiliación vive en otro viewport y no compite con ella.
  const proofBody = (
    <TiltCard className="hero__proof-tilt" maxTilt={SHOWCASE_TILT_MAX_DEG}>
      {proofCard}
    </TiltCard>
  )

  const actions = (
    <div className="hero__cta-row">
      <button
        type="button"
        className="hero__cta hero__cta--primary motion-icon-shift magnetic"
        onClick={() => onNavigate('members')}
        {...magneticProps}
      >
        {t('hero.ctaAffiliate')}
        <ArrowRight size={16} aria-hidden className="hero__cta-icon motion-icon-shift__target" />
      </button>
      {/* Una sola acción principal (Afiliarme); "eventos" es enlace subordinado.
          Pitbull vive en la ficha del meet — no se repite acá. */}
      <button type="button" className="hero__events-link" onClick={() => onNavigate('events')}>
        <span className="hero__cta-label hero__cta-label--full">{t('hero.ctaEvents')}</span>
        <span className="hero__cta-label hero__cta-label--short">{t('hero.ctaEventsShort')}</span>
        <ArrowRight size={13} aria-hidden className="hero__events-link-icon" />
      </button>
    </div>
  )

  return (
    <section className="hero hero--design hero--motion hero--statement">
      <div className="hero__backdrop" aria-hidden>
        <ResponsivePhoto
          className="hero__backdrop-img hero__backdrop-img--depth"
          avif={{ 640: heroPhotoAvif640, 1280: heroPhotoAvif1280, 2048: heroPhotoAvif }}
          webp={{ 640: heroPhotoWebp640, 1280: heroPhotoWebp1280, 2048: heroPhotoWebp }}
          src={heroPhoto}
          alt=""
          loading="eager"
          fetchPriority="high"
        />
      </div>

      <div className="hero__copy">
        <div className="hero__shell">
          {reducedMotion ? (
            <div className="hero__copy-inner">
              <div className="hero__main">
                <div className="hero__editorial">
                  <p className="hero__kicker">{kicker}</p>
                  {rule}
                  <h1 className="hero__title hero__title--design">{titleLines}</h1>
                  <p className="hero__lead">{lead}</p>
                </div>
                <div className="hero__actions">{actions}</div>
              </div>
              <div className="hero__proof">{proofBody}</div>
            </div>
          ) : (
            <div className="hero__copy-inner">
              <div className="hero__main">
                <m.div
                  className="hero__editorial"
                  initial="hidden"
                  animate="visible"
                  variants={heroStagger}
                >
                  <m.p className="hero__kicker" variants={heroSequenceItem}>
                    {kicker}
                  </m.p>
                  {rule}
                  <m.h1 className="hero__title hero__title--design" variants={heroStagger}>
                    {animatedTitle}
                  </m.h1>
                  <m.p className="hero__lead" variants={heroSequenceItem}>
                    {lead}
                  </m.p>
                </m.div>
                <m.div
                  className="hero__actions"
                  initial="hidden"
                  animate="visible"
                  variants={heroActionsItem}
                >
                  {actions}
                </m.div>
              </div>
              <m.div
                className="hero__proof"
                initial="hidden"
                animate="visible"
                variants={heroProofItem}
              >
                {proofBody}
              </m.div>
            </div>
          )}
        </div>
      </div>

      <HomeQuickBand onNavigate={onNavigate} variant="dock" />
    </section>
  )
}
