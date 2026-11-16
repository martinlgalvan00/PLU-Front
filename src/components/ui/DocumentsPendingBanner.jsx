import { ArrowRight, FileWarning } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { documentPackFocus, isDocumentPackComplete } from '../../lib/athleteDocuments.js'

const SPECIAL_BANNER_KEYS = {
  guardian: {
    title: 'account.documents.bannerGuardianTitle',
    lead: 'account.documents.bannerGuardianLead',
    memberLead: 'account.documents.bannerGuardianMemberLead',
  },
  dni_and_guardian: {
    title: 'account.documents.bannerDniGuardianTitle',
    lead: 'account.documents.bannerDniGuardianLead',
    memberLead: 'account.documents.bannerDniGuardianMemberLead',
  },
}

function documentBannerKeys({ focus, membershipCurrent, grandfathered }) {
  const special = SPECIAL_BANNER_KEYS[focus]
  if (special) {
    return {
      title: special.title,
      lead: membershipCurrent ? special.memberLead : special.lead,
    }
  }
  if (membershipCurrent) {
    return {
      title: 'account.documents.bannerMemberTitle',
      lead: 'account.documents.bannerMemberLead',
    }
  }
  if (grandfathered) {
    return {
      title: 'account.documents.bannerTitleLegacy',
      lead: 'account.documents.bannerLeadLegacy',
    }
  }
  return {
    title: 'account.documents.bannerTitle',
    lead: 'account.documents.bannerLead',
  }
}

export default function DocumentsPendingBanner({
  athlete,
  membershipCurrent = false,
  onComplete,
  step = 'documents',
}) {
  const { t } = useI18n()
  if (!athlete) return null
  if (step === 'file') {
    return (
      <aside className="account-verify account-verify--documents" role="status" aria-live="polite">
        <span className="account-verify__icon" aria-hidden>
          <FileWarning size={18} />
        </span>
        <div className="account-verify__copy">
          <p className="account-verify__title">{t('account.membershipFile.bannerTitle')}</p>
          <p className="account-verify__lead">{t('account.membershipFile.bannerLead')}</p>
        </div>
        {onComplete ? (
          <button type="button" className="account-verify__action" onClick={onComplete}>
            {t('account.membershipFile.bannerAction')}
            <ArrowRight size={14} aria-hidden />
          </button>
        ) : null}
      </aside>
    )
  }
  const pack = isDocumentPackComplete(athlete, athlete.documents)
  if (pack.complete) return null
  const grandfathered =
    athlete.documentsGrandfathered === true || athlete.documents_grandfathered === true
  const { title: titleKey, lead: leadKey } = documentBannerKeys({
    focus: documentPackFocus(pack.missing),
    membershipCurrent,
    grandfathered,
  })

  return (
    <aside className="account-verify account-verify--documents" role="status" aria-live="polite">
      <span className="account-verify__icon" aria-hidden>
        <FileWarning size={18} />
      </span>
      <div className="account-verify__copy">
        <p className="account-verify__title">{t(titleKey)}</p>
        <p className="account-verify__lead">{t(leadKey)}</p>
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
