import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { MOTION_DURATION } from '../../motion/tokens.ts'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

function FaqRefIcon({ isOpen }) {
  return (
    <span className="faq-item__icon-ref" aria-hidden>
      <span className="faq-item__icon-ref-bar" />
      <span className={`faq-item__icon-ref-bar ${isOpen ? '' : 'faq-item__icon-ref-bar--vert'}`} />
    </span>
  )
}

export default function FAQAccordion({ items, numbered = false, variant = 'default' }) {
  const [openIndex, setOpenIndex] = useState(-1)
  const { reducedMotion } = useMotionConfig()
  const isRef = variant === 'ref'
  const rootClass = isRef ? 'faq-accordion faq-accordion--ref' : 'faq-accordion'

  return (
    <div className={rootClass}>
      {items.map((item, index) => {
        const isOpen = openIndex === index
        return (
          <article className={`faq-item ${isOpen ? 'faq-item--open' : ''}`} key={item.q}>
            <button
              type="button"
              className="faq-item__trigger"
              aria-expanded={isOpen}
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
                <ChevronDown size={18} className="faq-item__icon" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  className="faq-item__panel-wrap"
                  data-open={isOpen}
                  initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.base, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="faq-item__panel">
                    <p>{item.a}</p>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </article>
        )
      })}
    </div>
  )
}
