import { m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from '../../motion/tokens.ts'
import MembersBlockHead from './MembersBlockHead.jsx'

export default function MembersRequirementsCarousel({
  items = [],
  ariaLabel,
  title,
  lead,
}) {
  const { t } = useI18n()
  const { reducedMotion } = useMotionConfig()

  if (!items.length) return null

  return (
    <div className="members-req">
      <MembersBlockHead
        eyebrow={t('pages.members.requirementsEyebrow')}
        title={title}
        lead={lead}
      />

      <ol className="members-req__board" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const content = (
            <>
              <span className="members-req__index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong className="members-req__label">{item.title}</strong>
              <p className="members-req__text">{item.text}</p>
            </>
          )

          if (reducedMotion) {
            return (
              <li key={item.id} className="members-req__cell">
                {content}
              </li>
            )
          }

          return (
            <m.li
              key={item.id}
              className="members-req__cell"
              initial={{ opacity: 0, y: 14 }}
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
