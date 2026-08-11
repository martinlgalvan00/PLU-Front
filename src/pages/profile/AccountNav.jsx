import { History, KeyRound, QrCode, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { LayoutGroup, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

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
  const { reducedMotion } = useMotionConfig()

  return (
    <nav className="account-nav" aria-label={t('account.eyebrow')}>
      <LayoutGroup id="account-nav-tabs">
        <div className="account-nav__inner" role="tablist">
          {ITEMS.map(({ id, icon: Icon, labelKey }) => {
            const isActive = activeId === id

            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${id}-tab`}
                aria-controls={id}
                aria-selected={isActive}
                className={`account-nav__item${isActive ? ' is-active' : ''}`}
                onClick={() => onChange(id)}
              >
                {isActive ? (
                  <m.span
                    className="account-nav__thumb"
                    layoutId="account-nav-active-thumb"
                    aria-hidden
                    transition={
                      reducedMotion
                        ? { duration: 0.01 }
                        : { type: 'spring', stiffness: 460, damping: 38, mass: 0.7 }
                    }
                  />
                ) : null}
                <span className="account-nav__item-content">
                  <Icon size={15} aria-hidden />
                  {t(`account.nav.${labelKey}`)}
                </span>
              </button>
            )
          })}
        </div>
      </LayoutGroup>
    </nav>
  )
}
