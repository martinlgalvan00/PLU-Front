import { useRef } from 'react'
import { m } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import ScrollRail from '../../motion/ScrollRail.tsx'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
  MOTION_VIEWPORT,
} from '../../motion/tokens.ts'
import { useStepBand } from '../../motion/useStepBand.ts'
import '../../styles/components/scroll-rail.css'
import '../../styles/components/editorial-ledger.css'

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: MOTION_STAGGER.step * 2, delayChildren: 0.05 } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

const ruleVariants = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: 0.9, ease: MOTION_EASE.cinematic } },
}

const pad2 = (value) => String(value).padStart(2, '0')

/**
 * Lista editorial numerada: una fila por ítem (número · título · explicación)
 * separadas por reglas que se trazan al entrar. La fila que se está leyendo se
 * enciende con una barra dorada. Con `rail`, una línea vertical se llena con el
 * scroll y cada fila tiene su marcador (pasos de un proceso).
 *
 * Reduced motion / tier low: lista estática.
 */
export default function EditorialLedger({ items, rail = false, className = '', ariaLabel }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const wrapRef = useRef(null)
  const { activeIndex, bind } = useStepBand(items.length, {
    enabled: !still,
    rootMargin: '-36% 0px -36% 0px',
  })

  const List = still ? 'ol' : m.ol
  const Row = still ? 'li' : m.li
  const Rule = still ? 'span' : m.span
  const listProps = still
    ? {}
    : {
        variants: listVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { ...MOTION_VIEWPORT, amount: 0.15 },
      }

  return (
    <div
      className={`editorial-ledger${rail ? ' editorial-ledger--rail' : ''} ${className}`.trim()}
      ref={wrapRef}
    >
      {rail ? <ScrollRail targetRef={wrapRef} className="editorial-ledger__rail" /> : null}
      <List className="editorial-ledger__list" aria-label={ariaLabel} {...listProps}>
        {items.map((item, index) => {
          const state =
            still || index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'idle'
          return (
            <Row
              key={item.id ?? item.title}
              ref={bind(index)}
              className="editorial-ledger__row"
              data-state={state}
              data-active={!still && index === activeIndex ? 'true' : undefined}
              {...(still ? {} : { variants: rowVariants })}
            >
              <Rule
                className="editorial-ledger__rule"
                aria-hidden
                {...(still ? {} : { variants: ruleVariants })}
              />
              {rail ? (
                <span className="step-dot editorial-ledger__dot" data-state={state} aria-hidden />
              ) : null}
              <span className="editorial-ledger__index" aria-hidden>
                {pad2(index + 1)}
              </span>
              <h3 className="editorial-ledger__title">{item.title}</h3>
              <p className="editorial-ledger__desc">{item.desc}</p>
            </Row>
          )
        })}
      </List>
    </div>
  )
}
