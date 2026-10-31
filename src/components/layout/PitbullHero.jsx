import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoPlatformCrew from '../../assets/DSC00286-display.jpg'
import photoPlatformCrewAvif from '../../assets/DSC00286-display.avif'
import photoPlatformCrewAvif480 from '../../assets/DSC00286-display-480.avif'
import photoPlatformCrewAvif800 from '../../assets/DSC00286-display-800.avif'
import photoPlatformCrewWebp from '../../assets/DSC00286-display.webp'
import photoPlatformCrewWebp480 from '../../assets/DSC00286-display-480.webp'
import photoPlatformCrewWebp800 from '../../assets/DSC00286-display-800.webp'
import photoMeetFloor from '../../assets/DSC00346-display.jpg'
import photoMeetFloorAvif from '../../assets/DSC00346-display.avif'
import photoMeetFloorAvif640 from '../../assets/DSC00346-display-640.avif'
import photoMeetFloorAvif1280 from '../../assets/DSC00346-display-1280.avif'
import photoMeetFloorWebp from '../../assets/DSC00346-display.webp'
import photoMeetFloorWebp640 from '../../assets/DSC00346-display-640.webp'
import photoMeetFloorWebp1280 from '../../assets/DSC00346-display-1280.webp'
import photoMedals from '../../assets/DSC01606-display.jpg'
import photoMedalsAvif from '../../assets/DSC01606-display.avif'
import photoMedalsAvif480 from '../../assets/DSC01606-display-480.avif'
import photoMedalsAvif800 from '../../assets/DSC01606-display-800.avif'
import photoMedalsWebp from '../../assets/DSC01606-display.webp'
import photoMedalsWebp480 from '../../assets/DSC01606-display-480.webp'
import photoMedalsWebp800 from '../../assets/DSC01606-display-800.webp'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PUBLIC_REGISTRATION_PHASE } from '../../lib/publicRegistrationPhase.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import { heroSequenceItem, heroStaggerContainer } from '../../motion/variants.ts'
import PitbullBrandMark from '../ui/PitbullBrandMark.jsx'
import ResponsivePhoto from '../ui/ResponsivePhoto.jsx'

// Paneles del collage: cada uno ocupa una fracción del frame, nunca 100vw.
const COLLAGE_SIZES = '(min-width: 1024px) 30vw, 45vw'

const HERO_COLLAGE = [
  {
    id: 'crew',
    src: photoPlatformCrew,
    avif: {
      480: photoPlatformCrewAvif480,
      800: photoPlatformCrewAvif800,
      1153: photoPlatformCrewAvif,
    },
    webp: {
      480: photoPlatformCrewWebp480,
      800: photoPlatformCrewWebp800,
      1153: photoPlatformCrewWebp,
    },
    className: 'pitbull-hero-masthead__plate--primary',
    width: 800,
    height: 1200,
    eager: true,
  },
  {
    id: 'platform',
    src: photoMeetFloor,
    avif: { 640: photoMeetFloorAvif640, 1280: photoMeetFloorAvif1280, 2048: photoMeetFloorAvif },
    webp: { 640: photoMeetFloorWebp640, 1280: photoMeetFloorWebp1280, 2048: photoMeetFloorWebp },
    className: 'pitbull-hero-masthead__plate--secondary',
    width: 800,
    height: 1200,
    eager: false,
  },
  {
    id: 'medals',
    src: photoMedals,
    avif: { 480: photoMedalsAvif480, 800: photoMedalsAvif800, 1153: photoMedalsAvif },
    webp: { 480: photoMedalsWebp480, 800: photoMedalsWebp800, 1153: photoMedalsWebp },
    className: 'pitbull-hero-masthead__plate--accent',
    width: 800,
    height: 1200,
    eager: false,
  },
]

function PitbullHeroPanel({
  athleteStatus = null,
  canRegister,
  lead = '',
  onHome,
  onJoin,
  onRegister,
  presentation,
  registerLabel = '',
  registrationFee,
  registrationPhase,
  t,
  ticketsOpen = false,
  title,
  motion = false,
}) {
  const isAthleteRegistered = athleteStatus === 'registered'
  const isPaymentPending = athleteStatus === 'pending_payment'
  const isFinished = registrationPhase === PUBLIC_REGISTRATION_PHASE.finished
  const isComingSoon = registrationPhase === PUBLIC_REGISTRATION_PHASE.coming_soon
  const isClosedOrFull =
    registrationPhase === PUBLIC_REGISTRATION_PHASE.closed ||
    registrationPhase === PUBLIC_REGISTRATION_PHASE.full

  // El estado propio manda sobre el del meet: a quien ya tiene cupo no se le
  // ofrece "Inscribirme", y a quien dejó el pago a medias se le ofrece cerrarlo.
  let primaryLabel = presentation.primaryCtaLabel
  let primaryDisabled = presentation.primaryDisabled
  let showRegistrationFee = false
  let showJoinSecondary = false

  if (isAthleteRegistered) {
    primaryLabel = t('pages.pitbull.viewMyRegistration')
    primaryDisabled = false
  } else if (isPaymentPending) {
    primaryLabel = t('pages.events.athleteStatusAction.pending_payment')
    primaryDisabled = false
  } else if (canRegister) {
    primaryLabel = registerLabel || t('pages.pitbull.register')
    primaryDisabled = false
    showRegistrationFee = Boolean(registrationFee) && presentation.showRegistrationFee
  } else if (isFinished) {
    primaryLabel = t('pages.home.viewResults')
    primaryDisabled = false
  } else if (isComingSoon) {
    primaryLabel = presentation.primaryCtaLabel || t('pages.pitbull.ctaComingSoon')
    primaryDisabled = true
  } else if (isClosedOrFull && ticketsOpen) {
    // La inscripción queda dicha en la línea de estado. El botón dorado es
    // la venta que sí está abierta.
    primaryLabel = t('pages.pitbull.heroTickets')
    primaryDisabled = false
    showJoinSecondary = presentation.showJoinSecondary
  } else if (isClosedOrFull) {
    primaryLabel = presentation.primaryCtaLabel || t('pages.pitbull.ctaClosed')
    primaryDisabled = true
    showJoinSecondary = presentation.showJoinSecondary
  } else {
    primaryLabel = presentation.primaryCtaLabel || t('pages.pitbull.ctaClosed')
    primaryDisabled = true
    showJoinSecondary = presentation.showJoinSecondary
  }

  const statusLabel = presentation.badgeLabel
  const statusTone = presentation.badgeTone
  const Item = motion ? m.div : 'div'
  const itemProps = motion ? { variants: heroSequenceItem } : {}

  return (
    <div className="pitbull-hero-masthead__panel">
      <Item {...itemProps}>
        <nav className="pitbull-hero-masthead__breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={onHome}>
            {t('design.home')}
          </button>
          <span aria-hidden>/</span>
          <span>{t('pages.pitbull.heroBreadcrumb')}</span>
        </nav>
      </Item>

      <header className="pitbull-hero-masthead__head">
        <Item {...itemProps}>
          <PitbullBrandMark
            size="lg"
            className="pitbull-hero-masthead__event-logo"
            label={t('nav.pitbull')}
            priority
          />
        </Item>

        <Item {...itemProps}>
          <span
            className={`pitbull-hero-masthead__status-badge pitbull-hero-masthead__status-badge--${statusTone}`}
          >
            <span className="pitbull-hero-masthead__status-badge-dot" aria-hidden />
            {statusLabel}
          </span>
        </Item>

        <Item {...itemProps}>
          <h1 className="pitbull-hero-masthead__title">{title}</h1>
        </Item>

        <Item {...itemProps}>
          <p className="pitbull-hero-masthead__lead">{lead || t('pages.pitbull.heroLead')}</p>
        </Item>
      </header>

      <Item {...itemProps}>
        <div className="pitbull-hero-masthead__actions">
          <button
            type="button"
            className={[
              'pitbull-hero-masthead__cta',
              'pitbull-hero-masthead__cta--primary',
              'motion-icon-shift',
              showRegistrationFee ? 'pitbull-hero-masthead__cta--decision' : '',
              primaryDisabled ? 'pitbull-hero-masthead__cta--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={primaryDisabled}
            onClick={primaryDisabled ? undefined : onRegister}
          >
            {showRegistrationFee ? (
              <span className="pitbull-hero-masthead__cta-body">
                <span className="pitbull-hero-masthead__cta-label">{primaryLabel}</span>
                <span className="pitbull-hero-masthead__cta-sep" aria-hidden>
                  ·
                </span>
                <span className="pitbull-hero-masthead__cta-fee">{registrationFee}</span>
              </span>
            ) : (
              <span className="pitbull-hero-masthead__cta-label">{primaryLabel}</span>
            )}
            {!primaryDisabled ? (
              <span className="pitbull-hero-masthead__cta-icon" aria-hidden>
                <ArrowRight size={15} strokeWidth={2} className="motion-icon-shift__target" />
              </span>
            ) : null}
          </button>
          {showJoinSecondary ? (
            <button
              type="button"
              className="pitbull-hero-masthead__cta pitbull-hero-masthead__cta--secondary motion-icon-shift"
              onClick={onJoin}
            >
              <span className="pitbull-hero-masthead__cta-label">{t('pages.pitbull.joinNow')}</span>
              <span className="pitbull-hero-masthead__cta-icon" aria-hidden>
                <ArrowRight size={15} strokeWidth={2} className="motion-icon-shift__target" />
              </span>
            </button>
          ) : null}
        </div>
      </Item>
    </div>
  )
}

/** Wipe editorial de las placas secundarias: la foto se descubre de abajo
 * hacia arriba. La placa LCP no arranca recortada para no demorar su pintado,
 * y en touch todas usan fade + rise (clip-path pesa en la GPU de mobile). */
const PLATE_WIPE = {
  initial: { clipPath: 'inset(100% 0% 0% 0%)' },
  animate: { clipPath: 'inset(0% 0% 0% 0%)' },
}
const PLATE_RISE = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
}

/** Collage editorial a sangre: 1 dominante + 2 secundarias (desktop). Mobile: solo LCP. */
function PitbullHeroFrame({ reducedMotion = false, heroImageUrl = null }) {
  const Plate = reducedMotion ? 'div' : m.div
  const finePointer = hasFinePointer()
  const plates = HERO_COLLAGE.map((plate) =>
    plate.eager && heroImageUrl
      ? { ...plate, src: heroImageUrl, avif: undefined, webp: undefined }
      : plate,
  )

  return (
    <div className="pitbull-hero-masthead__frame" aria-hidden>
      <div className="pitbull-hero-masthead__collage">
        {plates.map((plate, index) => (
          <Plate
            key={plate.id}
            className={`pitbull-hero-masthead__frame-plate ${plate.className}`}
            {...(reducedMotion
              ? {}
              : {
                  ...(finePointer && !plate.eager ? PLATE_WIPE : PLATE_RISE),
                  transition: {
                    duration:
                      finePointer && !plate.eager ? MOTION_DURATION.cinematic : MOTION_DURATION.slow,
                    ease: MOTION_EASE.cinematic,
                    delay: 0.12 + index * 0.1,
                  },
                })}
          >
            <ResponsivePhoto
              className="pitbull-hero-masthead__frame-img"
              avif={plate.avif}
              webp={plate.webp}
              src={plate.src}
              alt=""
              width={plate.width}
              height={plate.height}
              sizes={COLLAGE_SIZES}
              loading={plate.eager ? 'eager' : 'lazy'}
              fetchPriority={plate.eager ? 'high' : 'low'}
            />
            <div className="pitbull-hero-masthead__frame-scrim" />
          </Plate>
        ))}
      </div>
    </div>
  )
}

export default function PitbullHero({
  athleteStatus = null,
  canRegister,
  /** Bajada editable desde Vista publica. Vacia cae al copy del diseno. */
  lead = '',
  /** URL pública del hero (slot landing). Vacía = collage por defecto. */
  heroImageUrl = null,
  onHome,
  onJoin,
  onRegister,
  presentation,
  /**
   * Texto editable del boton principal. Solo reemplaza el caso "Inscribirme":
   * "Ver mi inscripcion" y "Completar el pago" los dicta el estado del atleta
   * y no pueden quedar tapados por copy editorial.
   */
  registerLabel = '',
  registrationFee,
  registrationPhase,
  ticketsOpen = false,
  title,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  const panel = (
    <PitbullHeroPanel
      athleteStatus={athleteStatus}
      canRegister={canRegister}
      lead={lead}
      onHome={onHome}
      onJoin={onJoin}
      onRegister={onRegister}
      presentation={presentation}
      registerLabel={registerLabel}
      registrationFee={registrationFee}
      registrationPhase={registrationPhase}
      t={t}
      ticketsOpen={ticketsOpen}
      title={title}
      motion={!reducedMotion}
    />
  )

  const frame = <PitbullHeroFrame heroImageUrl={heroImageUrl} reducedMotion={reducedMotion} />

  const className =
    'pitbull-hero-masthead pitbull-hero-masthead--bleed' +
    (reducedMotion ? '' : ' pitbull-hero-masthead--motion')

  if (reducedMotion) {
    return (
      <header className={className}>
        <div className="pitbull-hero-masthead__shell">
          <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--bleed">
            {panel}
            {frame}
          </div>
        </div>
      </header>
    )
  }

  return (
    <m.header
      className={className}
      initial="hidden"
      animate="visible"
      variants={heroStaggerContainer}
    >
      <div className="pitbull-hero-masthead__shell">
        <div className="pitbull-hero-masthead__layout pitbull-hero-masthead__layout--bleed">
          {panel}
          {frame}
        </div>
      </div>
    </m.header>
  )
}
