import { History } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'

export default function HistorySection({ athleteRegistrations, onNavigateSection }) {
  const { t } = useI18n()

  return (
    <section id="account-history" className="account-section account-section--neutral">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--neutral">
          <History size={21} />
        </div>
        <div>
          <span>{t('account.history.eyebrow')}</span>
          <h2>{t('account.history.title')}</h2>
        </div>
      </div>
      {athleteRegistrations.length ? (
        <div className="account-history-list">
          {athleteRegistrations.map((item) => (
            <article key={item.id}>
              <div>
                <span>{t('account.history.competition')}</span>
                <strong>{item.event}</strong>
              </div>
              <div>
                <span>{t('account.history.category')}</span>
                <strong>
                  {item.division} · {item.category}
                </strong>
              </div>
              <StatusPill value={item.status} />
            </article>
          ))}
        </div>
      ) : (
        <div className="account-empty">
          <p className="account-empty__title">{t('account.history.emptyTitle')}</p>
          <p className="account-empty__lead">{t('account.history.emptyLead')}</p>
          {typeof onNavigateSection === 'function' ? (
            <button
              type="button"
              className="account-empty__action"
              onClick={() => onNavigateSection('account-events')}
            >
              {t('account.history.emptyAction')}
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
