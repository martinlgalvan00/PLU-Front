import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function FAQAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="faq-accordion">
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
              {item.q}
              <ChevronDown size={18} className="faq-item__icon" />
            </button>
            <div className="faq-item__panel-wrap" data-open={isOpen}>
              <div className="faq-item__panel">
                <p>{item.a}</p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
