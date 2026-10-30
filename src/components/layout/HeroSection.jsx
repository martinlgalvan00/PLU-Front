import { ArrowRight } from 'lucide-react'
import { m, useScroll, useTransform } from 'motion/react'
import { useMemo, useState } from 'react'
import heroPhoto from '../../assets/DSC00346-display.jpg'
import heroPhotoAvif from '../../assets/DSC00346-display.avif'
import heroPhotoAvif640 from '../../assets/DSC00346-display-640.avif'
import heroPhotoAvif1280 from '../../assets/DSC00346-display-1280.avif'
import heroPhotoWebp from '../../assets/DSC00346-display.webp'
import heroPhotoWebp640 from '../../assets/DSC00346-display-640.webp'
import heroPhotoWebp1280 from '../../assets/DSC00346-display-1280.webp'
import HeroStatusCard from '../ui/HeroStatusCard.jsx'
import HomeQuickBand from '../ui/HomeQuickBand.jsx'
import HomeSeasonActions from '../ui/HomeSeasonActions.jsx'
import ResponsivePhoto from '../ui/ResponsivePhoto.jsx'
import { env } from '../../config/env.js'
import TiltCard from '../../motion/TiltCard.tsx'
import { findMorphSource, morphNavigate } from '../../motion/routeMorph.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import { useMagneticHover } from '../../motion/useMagneticHover.ts'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getSeasonHomeActions } from '../../lib/eventNavigation.js'
import { canBuyEventTickets } from '../../lib/eventPublicActions.js'
import { isPaidCheckoutOpen } from '../../lib/registrationSchedule.js'
import { getPublicEventStatus } from '../../lib/publicRegistrationPhase.js'
import { isRegistrationOpen } from '../../lib/status.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER_BY_TIER,
  SHOWCASE_TILT_MAX_DEG,
  scaleDuration,
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

/** Foto de fondo: empuje de entrada (1.14 → 1.02) y parallax con el scroll. Solo
 * transform; reduced motion / tier low la dejan quieta. */
function HeroBackdropPhoto({ children, still }) {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], [0, 90])

  if (still) return <div className="hero__backdrop-motion">{children}</div>

  return (
    <m.div
      className="hero__backdrop-motion"
      initial={{ scale: 1.14 }}
      animate={{ scale: 1.02 }}
      transition={{ duration: 2.8, ease: MOTION_EASE.cinematic }}
      style={{ y }}
    >
      {children}
    </m.div>
  )
}

export default function HeroSection({
  onNavigate,
  onSelectEvent,
  event,
  events = [],
  underConstructionEvents = [],
  registrationEnabled = true,
}) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const magneticProps = useMagneticHover()
  // La variante se elige una vez, al montar. El tier se sigue midiendo en vivo
  // (MotionProvider) y baja a 'low' a los ~1.5s en equipos que no sostienen
  // 60fps: si la variante cambiaba de wipe a fade, Motion dejaba de animar
  // `clipPath` y el título quedaba en `inset(100%)` — el H1 de la portada
  // desaparecía después de haberse mostrado. La entrada ya está corriendo o
  // terminó; cambiarle la coreografía a mitad no tiene nada que ganar.
  const [titleLineVariants] = useState(() =>
    tier !== 'low' && hasFinePointer() ? heroTitleLineWipe : heroTitleLine,
  )
  // El díptico anima sus propios carriles al montar (también cuando el
  // catálogo llega después). Este wrapper no se desplaza: si no, el texto
  // entra dos veces y, si el tier cambia a mitad, puede quedar invisible.
  const [seasonProofRest] = useState(() => ({
    hidden: { opacity: 1, y: 0 },
    visible: { opacity: 1, y: 0, transition: { duration: scaleDuration(MOTION_DURATION.instant, tier) } },
  }))
  const eventStatus = getPublicEventStatus(event, new Date(), { registrationEnabled })
  const registrationCheckoutOpen = isPaidCheckoutOpen(event, env, new Date(), {
    checkoutKind: 'registration',
  })
  const registrationAvailable = registrationCheckoutOpen && isRegistrationOpen(eventStatus)
  // Mismo interruptor que PitbullSpotlight: si el evento vende entradas, el
  // hero no puede seguir diciendo "Cerrado" (eso es la inscripción de atletas).
  const ticketsAvailable = canBuyEventTickets(event, { config: env })
  const statusLabelOverride = ticketsAvailable
    ? t('hero.statusTicketsOpen')
    : registrationAvailable
      ? t('hero.statusRegistrationOpen')
      : undefined
  const seasonActions = useMemo(
    () =>
      getSeasonHomeActions(events.length ? events : event ? [event] : [], {
        registrationEnabled,
        ticketSalesEnabled: env.ticketSalesEnabled,
        underConstructionEvents,
      }),
    [events, event, registrationEnabled, underConstructionEvents],
  )
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
      <m.span className="hero__title-line hero__title-line--accent" variants={titleLineVariants}>
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

  /** `intent: 'page'` llega del link "Página oficial" del carril de
   * inscripción: abre la ficha (o el aviso de construcción) sin el wizard. */
  function handleSeasonAction(action, clickEvent, intent) {
    if (!action?.event) return
    if (action.kind === 'tickets') {
      onNavigate?.('tickets', { eventSlug: action.event.slug ?? action.event.id })
      return
    }
    if (
      action.kind === 'registration' &&
      intent !== 'page' &&
      typeof onSelectEvent === 'function'
    ) {
      onSelectEvent(action.event)
      return
    }
    // registration_soon, "Página oficial" (y fallback): ficha del evento, sin
    // forzar el wizard. El nombre del meet del carril viaja hasta el título de
    // la ficha.
    const destination = action.event.slug
      ? { view: 'events', options: { eventSlug: action.event.slug } }
      : { view: 'events', options: {} }
    morphNavigate(
      findMorphSource(
        clickEvent?.currentTarget?.closest?.('.home-season-actions__lane') ??
          clickEvent?.currentTarget,
        '.home-season-actions__meet',
      ),
      () => onNavigate?.(destination.view, destination.options),
    )
  }

  const proofCard =
    seasonActions.length > 0 ? (
      <HomeSeasonActions actions={seasonActions} onActivate={handleSeasonAction} />
    ) : (
      <HeroStatusCard
        event={event}
        onSelect={(clickEvent) =>
          morphNavigate(findMorphSource(clickEvent?.currentTarget, '.hero-meta__meet'), () =>
            onNavigate('pitbull'),
          )
        }
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
  // de afiliación vive en otro viewport y no compite con ella. El díptico de
  // temporada no usa tilt: dos carriles accionables no deben inclinarse juntos.
  const proofBody =
    seasonActions.length > 0 ? (
      proofCard
    ) : (
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
        <HeroBackdropPhoto still={reducedMotion || tier === 'low'}>
          <ResponsivePhoto
            className="hero__backdrop-img hero__backdrop-img--depth"
            avif={{ 640: heroPhotoAvif640, 1280: heroPhotoAvif1280, 2048: heroPhotoAvif }}
            webp={{ 640: heroPhotoWebp640, 1280: heroPhotoWebp1280, 2048: heroPhotoWebp }}
            src={heroPhoto}
            alt=""
            loading="eager"
            fetchPriority="high"
          />
        </HeroBackdropPhoto>
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
                variants={seasonActions.length > 0 ? seasonProofRest : heroProofItem}
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
