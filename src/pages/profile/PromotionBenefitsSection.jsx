import { BadgePercent, KeyRound, LockKeyhole, Sparkles } from 'lucide-react'
import SecretOfferCodeRedeemer from '../../components/ui/SecretOfferCodeRedeemer.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ACCOUNT_OFFER_TAB } from '../../lib/navigation.js'
import { readPendingPromotionCode } from '../../services/promotionCodeService.js'
import '../../styles/components/promotion-benefits.css'

const BENEFIT_TYPES = [
  { id: 'discount', icon: BadgePercent },
  { id: 'access', icon: LockKeyhole },
  { id: 'offer', icon: Sparkles },
]

export default function PromotionBenefitsSection({
  session,
  hasExclusiveOffer = false,
  onNavigate,
  onNavigateSection,
  onOfferUnlocked,
}) {
  const { t } = useI18n()
  const pendingCode = readPendingPromotionCode()?.code ?? ''

  return (
    <section className="account-section promotion-benefits" id="account-benefits">
      <header className="account-section__heading">
        <span className="account-section__icon account-section__icon--gold" aria-hidden>
          <KeyRound size={19} />
        </span>
        <span className="account-section__heading-copy">
          <span className="account-section__eyebrow">{t('account.benefits.eyebrow')}</span>
          <h2>{t('account.benefits.title')}</h2>
        </span>
      </header>
      <p className="account-section__lead promotion-benefits__lead">{t('account.benefits.lead')}</p>

      <div className="promotion-benefits__layout">
        <div className="promotion-benefits__redeem">
          <SecretOfferCodeRedeemer
            defaultOpen
            initialCode={pendingCode}
            session={session}
            onNavigate={onNavigate}
            onOfferUnlocked={onOfferUnlocked}
          />
          <p className="promotion-benefits__safe-note">
            <KeyRound size={14} aria-hidden />
            <span>{t('account.benefits.safeNote')}</span>
          </p>
          {hasExclusiveOffer ? (
            <button
              type="button"
              className="promotion-benefits__offer-link"
              onClick={() => onNavigateSection?.(ACCOUNT_OFFER_TAB)}
            >
              <Sparkles size={15} aria-hidden />
              {t('account.benefits.openOffer')}
            </button>
          ) : null}
        </div>

        <div className="promotion-benefits__types" aria-labelledby="benefit-types-title">
          <h3 id="benefit-types-title">{t('account.benefits.typesTitle')}</h3>
          <ul>
            {BENEFIT_TYPES.map(({ id, icon: Icon }) => (
              <li key={id}>
                <span className="promotion-benefits__type-icon" aria-hidden>
                  <Icon size={17} />
                </span>
                <span>
                  <strong>{t(`account.benefits.types.${id}.title`)}</strong>
                  <small>{t(`account.benefits.types.${id}.lead`)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
