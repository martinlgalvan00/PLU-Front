import { useI18n } from '../../i18n/I18nProvider.jsx'
import AnimatedSectionHeader from '../../motion/AnimatedSectionHeader.tsx'
import StaggerGroup from '../../motion/StaggerGroup.tsx'

export default function RulebookSummary({ items }) {
  const { t } = useI18n()

  return (
    <section className="rulebook-summary" aria-label={t('pages.rulebook.summaryAria')}>
      <AnimatedSectionHeader
        align="left"
        className="rulebook-summary__head motion-section-header--rulebook"
        description={t('pages.rulebook.summaryLead')}
        eyebrow={t('pages.rulebook.summaryEyebrow')}
        title={t('pages.rulebook.summaryTitle')}
      />

      <StaggerGroup as="ol" className="rulebook-summary__rail" stagger={80} variant="up">
        {items.map((item, index) => (
          <li key={item.id}>
            <article className="rulebook-summary__card">
              <span className="rulebook-summary__index motif-num" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="rulebook-summary__body">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          </li>
        ))}
      </StaggerGroup>

      <p className="rulebook-summary__disclaimer">{t('pages.rulebook.disclaimer')}</p>
    </section>
  )
}
