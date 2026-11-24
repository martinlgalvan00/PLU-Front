import { eventLandingFaqItems } from '../../../lib/eventLanding.js'
import BlockShell from './BlockShell.jsx'

/** Preguntas frecuentes: solo los pares completos que cargó el staff. */
export default function FaqBlock({ block, ctx }) {
  const { landing, t } = ctx
  const items = eventLandingFaqItems(landing.slots)
  if (items.length === 0) return null
  return (
    <BlockShell id={block.id} type="faq" title={t('pages.events.landingFaqTitle')}>
      <dl className="lb-faq">
        {items.map((item) => (
          <div key={item.question}>
            <dt>{item.question}</dt>
            <dd>{item.answer}</dd>
          </div>
        ))}
      </dl>
    </BlockShell>
  )
}
