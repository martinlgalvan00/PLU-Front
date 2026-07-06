import { History, KeyRound, QrCode, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const ITEMS = [
  { id: 'account-qr', icon: QrCode, labelKey: 'qr' },
  { id: 'account-events', icon: Trophy, labelKey: 'events' },
  { id: 'account-history', icon: History, labelKey: 'history' },
  { id: 'account-membership', icon: ShieldCheck, labelKey: 'membership' },
  { id: 'account-personal-data', icon: UserRound, labelKey: 'personalData' },
  { id: 'account-security', icon: KeyRound, labelKey: 'security' },
]

/**
 * Tabs de la cuenta: un solo panel visible a la vez (ver
 * AthleteProfilePage.jsx). Componente controlado — no scrollea ni observa
 * el viewport, solo avisa qué tab se eligió.
 */
export default function AccountNav({ activeId, onChange }) {
  const { t } = useI18n()

  return (
    <nav className="account-nav" aria-label={t('account.eyebrow')}>
      <div className="account-nav__inner" role="tablist">
        {ITEMS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${id}-tab`}
            aria-controls={id}
            aria-selected={activeId === id}
            className={`account-nav__item${activeId === id ? ' is-active' : ''}`}
            onClick={() => onChange(id)}
          >
            <Icon size={15} aria-hidden />
            {t(`account.nav.${labelKey}`)}
          </button>
        ))}
      </div>
    </nav>
  )
}
