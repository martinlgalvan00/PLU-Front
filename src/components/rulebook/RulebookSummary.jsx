import { ListOrdered, Repeat, Scale, Users } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const SUMMARY_ICONS = {
  sequence: ListOrdered,
  attempts: Repeat,
  judges: Users,
  weighin: Scale,
}

export default function RulebookSummary({ items }) {
  const { t } = useI18n()

  return (
    <section className="rulebook-summary" aria-label={t('pages.rulebook.summaryAria')}>
      <header className="rulebook-summary__head">
        <div>
          <span className="rulebook-summary__eyebrow">{t('pages.rulebook.summaryEyebrow')}</span>
          <h2 className="rulebook-summary__title">{t('pages.rulebook.summaryTitle')}</h2>
        </div>
        <p className="rulebook-summary__lead">{t('pages.rulebook.summaryLead')}</p>
      </header>

      <ol className="rulebook-summary__rail">
        {items.map((item, index) => {
          const Icon = SUMMARY_ICONS[item.id] ?? ListOrdered
          return (
            <li key={item.id}>
              <article className="rulebook-summary__card">
                <span className="rulebook-summary__index" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="rulebook-summary__icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="rulebook-summary__body">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            </li>
          )
        })}
      </ol>

      <p className="rulebook-summary__disclaimer">{t('pages.rulebook.disclaimer')}</p>
    </section>
  )
}
