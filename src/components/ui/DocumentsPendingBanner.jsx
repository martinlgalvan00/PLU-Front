import { ArrowRight, FileWarning } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { isDocumentPackComplete } from '../../lib/athleteDocuments.js'

export default function DocumentsPendingBanner({ athlete, onComplete }) {
  const { t } = useI18n()
  if (!athlete) return null
  const pack = isDocumentPackComplete(athlete, athlete.documents)
  if (pack.complete) return null

  return (
    <aside className="account-verify account-verify--documents" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <FileWarning size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t('account.documents.bannerTitle')}</p>
        <p className="account-verify__lead">{t('account.documents.bannerLead')}</p>
      </div>
      {onComplete ? (
        <button type="button" className="account-verify__action" onClick={onComplete}>
          {t('account.documents.bannerAction')}
          <ArrowRight size={14} aria-hidden />
        </button>
      ) : null}
    </aside>
  )
}
