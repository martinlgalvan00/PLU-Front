import { Check } from 'lucide-react'
import { m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import TiltCard from '../../motion/TiltCard.tsx'
import { MOTION_EASE, TILT_MAX_DEG } from '../../motion/tokens.ts'
import '../../styles/components/contact-envelope.css'

/**
 * Sobre en 3D que acompaña el formulario de Contacto. La carta se va armando
 * con lo que escribís (motivo, mensaje y firma). Al enviar, la carta baja al
 * sobre, la solapa se cierra sobre ella y se estampa el sello dorado; si algo
 * falla, la solapa vuelve a abrirse y la carta queda lista para reintentar.
 *
 *   idle → sending → sent        (feliz)
 *   sending → error → idle…      (reintento)
 *
 * Solo transform + opacity. Reduced motion / tier low: cada fase queda en su
 * estado final, sin recorrido ni tilt.
 */

const letterVariants = {
  idle: { y: '-48%', scale: 1, transition: { duration: 0.8, ease: MOTION_EASE.cinematic } },
  error: { y: '-48%', scale: 1, transition: { duration: 0.8, ease: MOTION_EASE.cinematic } },
  sending: { y: '4%', scale: 0.97, transition: { duration: 1, ease: MOTION_EASE.cinematic } },
  sent: { y: '4%', scale: 0.97, transition: { duration: 0.4 } },
}

const flapVariants = {
  idle: { rotateX: 180, zIndex: 1, transition: { duration: 0.9, ease: MOTION_EASE.cinematic } },
  error: { rotateX: 180, zIndex: 1, transition: { duration: 0.9, ease: MOTION_EASE.cinematic } },
  sending: {
    rotateX: 0,
    zIndex: 4,
    transition: { duration: 1, ease: MOTION_EASE.cinematic, delay: 0.85 },
  },
  sent: { rotateX: 0, zIndex: 4, transition: { duration: 0.4 } },
}

const sealVariants = {
  idle: { scale: 0, opacity: 0, transition: { duration: 0.25 } },
  error: { scale: 0, opacity: 0, transition: { duration: 0.25 } },
  sending: {
    scale: [0, 1.18, 1],
    opacity: 1,
    transition: { duration: 0.6, ease: MOTION_EASE.out, delay: 1.9 },
  },
  sent: { scale: 1, opacity: 1, transition: { duration: 0.3 } },
}

const envelopeVariants = {
  idle: { y: 0, rotateZ: 0, transition: { duration: 0.6, ease: MOTION_EASE.out } },
  error: { y: 0, rotateZ: 0, transition: { duration: 0.6, ease: MOTION_EASE.out } },
  sending: { y: 0, rotateZ: 0 },
  sent: {
    y: [0, -14, -8],
    rotateZ: [0, -1.5, -1],
    transition: { duration: 1.1, ease: MOTION_EASE.cinematic, delay: 0.2 },
  },
}

export default function ContactEnvelope({ phase, labels, motive, name, message }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const hasMessage = message.trim().length > 0
  // En quieto no hay recorrido: cada fase se monta ya en su estado.
  const mp = still ? { initial: false, animate: phase } : { initial: 'idle', animate: phase }

  return (
    <div className="letter-stage" data-phase={phase} aria-hidden>
      <TiltCard
        className="letter-stage__tilt"
        innerClassName="tilt-card__inner letter-stage__tilt-inner"
        maxTilt={TILT_MAX_DEG}
      >
        <m.div className="envelope" variants={envelopeVariants} {...mp}>
          <span className="envelope__back" />

          <m.div className="envelope__letter" variants={letterVariants} {...mp}>
            <p className="envelope__to">{labels.to}</p>
            <p className="envelope__motive">{motive}</p>
            {hasMessage ? (
              <p className="envelope__body">{message}</p>
            ) : (
              <span className="envelope__lines">
                <i />
                <i />
                <i />
              </span>
            )}
            <p className="envelope__sign">{name.trim() || labels.signature}</p>
          </m.div>

          <span className="envelope__front" />

          <m.span className="envelope__flap" variants={flapVariants} {...mp} />

          <m.span className="envelope__seal" variants={sealVariants} {...mp}>
            {phase === 'sent' ? (
              <Check size={18} strokeWidth={2.4} />
            ) : (
              <span className="envelope__seal-mark">PLU</span>
            )}
          </m.span>
        </m.div>
      </TiltCard>
    </div>
  )
}
