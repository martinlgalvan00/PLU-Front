import { useEffect, useRef } from 'react'
import { ArrowRight, ClipboardList, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { visibleProfileNotice } from '../../lib/athleteProfile.js'

function fieldLabel(field, t) {
  const keys = {
    phone: 'account.personalData.phone',
    city: 'account.personalData.city',
    province: 'account.personalData.province',
    gym: 'account.personalData.gym',
    division: 'account.personalData.division',
    category: 'account.personalData.category',
    estimatedWeight: 'account.personalData.estimatedWeight',
  }
  return t(keys[field] ?? field)
}

export default function ProfileIncompleteNoticeBanner({
  athlete,
  onComplete,
  onDismiss,
  onRead,
}) {
  const { t } = useI18n()
  const notice = visibleProfileNotice(athlete?.profileNotices)
  const markedRef = useRef(null)

  useEffect(() => {
    if (!notice?.id || notice.readAt || !onRead) return
    if (markedRef.current === notice.id) return
    markedRef.current = notice.id
    void onRead(notice.id)
  }, [notice, onRead])

  if (!notice) return null

  const fields = (notice.missingFields ?? [])
    .map((field) => fieldLabel(field, t))
    .filter(Boolean)
    .join(', ')

  return (
    <aside className="account-verify account-verify--profile-notice" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <ClipboardList size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t('account.profileNotice.title')}</p>
        <p className="account-verify__lead">
          {t('account.profileNotice.lead', { fields: fields || '—' })}
        </p>
        {notice.message ? <p className="account-verify__email">{notice.message}</p> : null}
      </div>
      {onComplete ? (
        <button type="button" className="account-verify__action" onClick={onComplete}>
          {t('account.profileNotice.action')}
          <ArrowRight size={14} aria-hidden />
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="account-verify__dismiss"
          onClick={() => onDismiss(notice.id)}
          aria-label={t('account.profileNotice.dismiss')}
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </aside>
  )
}
