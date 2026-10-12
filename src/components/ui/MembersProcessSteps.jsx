import { useRef } from 'react'
import { AnimatePresence, m, useInView } from 'motion/react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import ScrollRail from '../../motion/ScrollRail.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from '../../motion/tokens.ts'
import { useMinWidth } from '../../motion/useMinWidth.ts'
import { useStepBand } from '../../motion/useStepBand.ts'
import { staggerContainer, staggerItem } from '../../motion/variants.ts'
import '../../styles/components/scroll-rail.css'
import ExplainerScene from './MembersExplainerScenes.jsx'

function padIndex(value) {
  return String(value).padStart(2, '0')
}

/** Escena dentro del paso (mobile): se reproduce cuando entra en pantalla. */
function InlineScene({ index, step, total, price }) {
  const ref = useRef(null)
  const seen = useInView(ref, { once: true, amount: 0.55 })

  return (
    <div className="members-steps__inline-scene" ref={ref}>
      <ExplainerScene index={index} step={step} total={total} play={seen} price={price} />
    </div>
  )
}

/**
 * "Cómo funciona" como explicativo animado. En desktop, un escenario fijo a la
 * derecha cuenta cada paso (se llena el formulario, se paga, se arma la
 * credencial) mientras el scroll avanza por la lista; en mobile cada paso trae
 * su escena y se reproduce al llegar. Una línea de progreso y un marcador por
 * paso (hueco → relleno → activo) acompañan el recorrido. El texto nunca se
 * atenúa: lo que cambia es la línea, el marcador y la escena.
 *
 * Reduced motion / tier low: lista estática, línea completa y sin escenas.
 */
export default function MembersProcessSteps({ steps = [], ariaLabel, price }) {
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const wide = useMinWidth(900)
  const listRef = useRef(null)
  const { activeIndex, bind } = useStepBand(steps.length, { enabled: !still })

  const List = still ? 'ol' : m.ol
  const Item = still ? 'li' : m.li
  const listProps = still
    ? {}
    : {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
        variants: staggerContainer,
      }
  const showStage = !still && wide
  const showInline = !still && !wide

  return (
    <div className="members-explainer" data-stage={showStage ? 'true' : undefined}>
      <div className="members-steps" ref={listRef}>
        <ScrollRail targetRef={listRef} className="members-steps__rail" />
        <List
          className="members-guide__list members-guide__list--rail"
          aria-label={ariaLabel}
          {...listProps}
        >
          {steps.map((step, index) => {
            const state =
              still || index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'idle'
            return (
              <Item
                key={step.step ?? step.title}
                ref={bind(index)}
                className="members-guide__item"
                data-state={state}
                aria-current={!still && state === 'active' ? 'step' : undefined}
                {...(still ? {} : { variants: staggerItem })}
              >
                <span className="step-dot members-steps__dot" data-state={state} aria-hidden />
                <span className="members-guide__index" aria-hidden>
                  {padIndex(index + 1)}
                </span>
                <h3 className="members-guide__item-title">{step.title}</h3>
                <p className="members-guide__item-text">{step.text}</p>
                {showInline ? (
                  <InlineScene index={index} step={step} total={steps.length} price={price} />
                ) : null}
              </Item>
            )
          })}
        </List>
      </div>

      {showStage ? (
        <div className="members-explainer__stage" aria-hidden>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={activeIndex}
              className="members-explainer__frame"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
              transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
            >
              <ExplainerScene
                index={activeIndex}
                step={steps[activeIndex]}
                total={steps.length}
                play
                price={price}
              />
            </m.div>
          </AnimatePresence>
          <div className="members-explainer__chips">
            {steps.map((step, index) => (
              <span
                key={step.step ?? step.title}
                data-on={index <= activeIndex ? 'true' : 'false'}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
