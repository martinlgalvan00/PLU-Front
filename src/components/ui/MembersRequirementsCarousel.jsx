import { useEffect, useRef, useState } from 'react'
import { m } from 'motion/react'
import { Camera, HeartPulse, IdCard, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import TiltCard from '../../motion/TiltCard.tsx'
import { MOTION_VIEWPORT } from '../../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../../motion/variants.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

const REQUIREMENT_ICONS = {
  id: IdCard,
  age: UserRound,
  health: HeartPulse,
  photo: Camera,
}

/** Banda central del viewport: el requisito que la cruza pasa al frente. */
const ACTIVE_BAND_MARGIN = '-45% 0px -45% 0px'

function padIndex(value) {
  return String(value).padStart(2, '0')
}

/**
 * Requisitos — dossier 3D: una ficha protagonista (TiltCard ≤3.5°) y el resto
 * en profundidad. El paso activo se elige al leer, al foco o al clic.
 * Reduced motion / tier low: placas estáticas.
 */
export default function MembersRequirementsCarousel({ items = [], ariaLabel, title, lead }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const minimalMotion = reducedMotion || tier === 'low'
  const [activeIndex, setActiveIndex] = useState(0)
  const stepRefs = useRef([])

  useEffect(() => {
    if (minimalMotion || typeof IntersectionObserver === 'undefined') return undefined

    // Se lleva el conjunto de pasos dentro de la franja (no el último evento):
    // un salto de scroll puede reportar entradas y salidas en lotes distintos.
    const inBand = new Set()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(entry.target.dataset.index)
          if (entry.isIntersecting) inBand.add(index)
          else inBand.delete(index)
        }
        if (inBand.size) setActiveIndex(Math.min(...inBand))
      },
      { rootMargin: ACTIVE_BAND_MARGIN },
    )
    stepRefs.current.forEach((node) => node && observer.observe(node))

    return () => observer.disconnect()
  }, [minimalMotion, items.length])

  if (!items.length) return null

  const totalLabel = padIndex(items.length)

  const head = (
    <MembersBlockHead eyebrow={t('pages.members.requirementsEyebrow')} title={title} lead={lead} />
  )

  if (minimalMotion) {
    return (
      <div className="members-req" data-theater="off" aria-label={ariaLabel}>
        {head}
        <ol className="members-req__board">
          {items.map((item, index) => (
            <li key={item.id} className="members-req__cell">
              <StaticRequirementPlate item={item} index={index} />
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="members-req members-req--stage" data-theater="js" aria-label={ariaLabel}>
      {head}

      <div className="members-req__showcase">
        <div className="members-req__stage" aria-hidden>
          <TiltCard className="members-req__tilt" maxTilt={3.5}>
            <div className="members-req__stack">
              {items.map((item, index) => {
                const offset = index - activeIndex
                const Icon = REQUIREMENT_ICONS[item.id] ?? IdCard
                return (
                  <div
                    key={item.id}
                    className="members-req__card"
                    data-state={offset < 0 ? 'past' : offset === 0 ? 'active' : 'next'}
                    style={{ '--offset': String(Math.max(offset, 0)) }}
                  >
                    <div className="members-req__card-head">
                      <span className="members-req__card-index">
                        {padIndex(index + 1)} / {totalLabel}
                      </span>
                      <span className="members-req__card-icon">
                        <Icon size={22} strokeWidth={1.4} />
                      </span>
                    </div>
                    <div className="members-req__card-copy">
                      <p className="members-req__card-title">{item.title}</p>
                      <p className="members-req__card-text">{item.text}</p>
                    </div>
                    <p className="members-req__card-foot">
                      <span>{t('pages.members.requirementsEyebrow')}</span>
                      <span>PLU ARG</span>
                    </p>
                  </div>
                )
              })}
            </div>
          </TiltCard>
        </div>

        <m.ol
          className="members-req__timeline"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={MOTION_VIEWPORT}
        >
          {items.map((item, index) => (
            <m.li
              key={item.id}
              ref={(node) => {
                stepRefs.current[index] = node
              }}
              data-index={index}
              className={`members-req__timeline-item${index === activeIndex ? ' is-active' : ''}`}
              aria-current={index === activeIndex ? 'step' : undefined}
              variants={staggerItem}
              tabIndex={0}
              onClick={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setActiveIndex(index)
                }
              }}
            >
              <span className="members-req__step-index" aria-hidden>
                {padIndex(index + 1)}
              </span>
              <div className="members-req__step-body">
                <h3 className="members-req__step-title">{item.title}</h3>
                <p className="members-req__step-text">{item.text}</p>
              </div>
            </m.li>
          ))}
        </m.ol>
      </div>
    </div>
  )
}

function StaticRequirementPlate({ item, index }) {
  const Icon = REQUIREMENT_ICONS[item.id] ?? IdCard

  return (
    <div className="members-req__plate">
      <div className="members-req__mark">
        <span className="members-req__index" aria-hidden>
          {padIndex(index + 1)}
        </span>
        <span className="members-req__icon" aria-hidden>
          <Icon size={16} strokeWidth={1.4} />
        </span>
      </div>
      <div className="members-req__body">
        <h3 className="members-req__label">{item.title}</h3>
        <p className="members-req__text">{item.text}</p>
      </div>
    </div>
  )
}
