import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

export default function MembersBenefitsShowcase({ items = [], title, lead, ariaLabel }) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  if (!items.length) return null

  return (
    <div className="members-benefits">
      <MembersBlockHead
        eyebrow={t('pages.members.benefitsEyebrow')}
        title={title}
        lead={lead}
      />

      <ol className="members-benefits__grid" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const content = (
            <>
              <span className="members-benefits__index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="members-benefits__label">{item.title}</h3>
              <p className="members-benefits__text">{item.text}</p>
            </>
          )

          if (reducedMotion) {
            return (
              <li key={item.id} className="members-benefits__cell">
                {content}
              </li>
            )
          }

          return (
            <m.li
              key={item.id}
              className="members-benefits__cell"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: MOTION_VIEWPORT.once, amount: 0.3 }}
              transition={{
                duration: MOTION_DURATION.slow,
                ease: MOTION_EASE.out,
                delay: index * 0.07,
              }}
            >
              {content}
            </m.li>
          )
        })}
      </ol>
    </div>
  )
}
