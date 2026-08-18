import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { MOTION_DISTANCE, MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

function FaqRefIcon({ isOpen }) {
  return (
    <span className="faq-item__icon-ref" aria-hidden>
      <span className="faq-item__icon-ref-bar" />
      <span className={`faq-item__icon-ref-bar ${isOpen ? '' : 'faq-item__icon-ref-bar--vert'}`} />
    </span>
  )
}

export default function FAQAccordion({
  idPrefix = 'faq',
  items,
  numbered = false,
  variant = 'default',
}) {
  const [openIndex, setOpenIndex] = useState(-1)
  const { reducedMotion } = useMotionConfig()
  const isRef = variant === 'ref'
  const rootClass = isRef ? 'faq-accordion faq-accordion--ref' : 'faq-accordion'

  const panelTransition = reducedMotion
    ? { duration: 0 }
    : {
        height: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.cinematic },
        opacity: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
      }

  const contentTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: MOTION_DURATION.base,
        ease: MOTION_EASE.out,
        delay: 0.06,
      }

  const contentExit = reducedMotion
    ? { duration: 0 }
    : {
        duration: MOTION_DURATION.fast,
        ease: MOTION_EASE.inOut,
      }

  return (
    <div className={rootClass}>
      {items.map((item, index) => {
        const isOpen = openIndex === index
        const triggerId = `${idPrefix}-question-${index + 1}`
        const panelId = `${idPrefix}-answer-${index + 1}`
        return (
          <article
            className={`faq-item ${isOpen ? 'faq-item--open' : ''}`}
            id={`${idPrefix}-${index + 1}`}
            key={item.q}
          >
            <h3 className="faq-item__heading">
              <button
                type="button"
                className="faq-item__trigger"
                aria-controls={panelId}
                aria-expanded={isOpen}
                id={triggerId}
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
              >
                {numbered && isRef && (
                  <span className="faq-item__index" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                )}
                {isRef ? <span className="faq-item__question">{item.q}</span> : item.q}
                {isRef ? (
                  <FaqRefIcon isOpen={isOpen} />
                ) : (
                  <ChevronDown size={18} className="faq-item__icon" aria-hidden />
                )}
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  className="faq-item__panel-wrap"
                  data-open={isOpen}
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={
                    reducedMotion
                      ? undefined
                      : {
                          height: 0,
                          opacity: 0,
                          transition: {
                            height: { duration: MOTION_DURATION.base, ease: MOTION_EASE.inOut },
                            opacity: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.inOut },
                          },
                        }
                  }
                  transition={panelTransition}
                  style={{ overflow: 'hidden' }}
                >
                  <m.div
                    className="faq-item__panel"
                    initial={reducedMotion ? false : { opacity: 0, y: MOTION_DISTANCE.sm }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      reducedMotion ? undefined : { opacity: 0, y: -4, transition: contentExit }
                    }
                    transition={contentTransition}
                  >
                    <p>{item.a}</p>
                  </m.div>
                </m.div>
              )}
            </AnimatePresence>
          </article>
        )
      })}
    </div>
  )
}
