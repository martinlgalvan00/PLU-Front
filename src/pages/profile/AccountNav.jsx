import { useEffect, useRef, useState } from 'react'
import {
  BadgePercent,
  History,
  KeyRound,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react'
import { LayoutGroup, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ACCOUNT_TAB_IDS } from '../../lib/navigation.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

/**
 * Presentación de cada ficha. El ORDEN no vive acá: sale de `ACCOUNT_TAB_IDS`
 * (src/lib/navigation.js), que es el mismo que usa AthleteProfilePage para
 * decidir de qué lado entra el panel. Duplicarlo dejaría la cinta y el
 * movimiento del contenido contradiciéndose.
 */
const ITEM_CHROME = {
  'account-qr': { icon: QrCode, labelKey: 'qr' },
  'account-benefits': { icon: BadgePercent, labelKey: 'benefits' },
  'account-offer': { icon: Sparkles, labelKey: 'offer' },
  'account-events': { icon: Trophy, labelKey: 'events' },
  'account-history': { icon: History, labelKey: 'history' },
  'account-membership': { icon: ShieldCheck, labelKey: 'membership' },
  'account-payments': { icon: Receipt, labelKey: 'payments' },
  'account-personal-data': { icon: UserRound, labelKey: 'personalData' },
  'account-security': { icon: KeyRound, labelKey: 'security' },
}

const ITEMS = ACCOUNT_TAB_IDS.map((id) => ({ id, ...ITEM_CHROME[id] }))

const OVERFLOW_EDGE = 4

function readOverflow(rail) {
  if (!rail) return { start: false, end: false }
  const max = rail.scrollWidth - rail.clientWidth
  if (max <= OVERFLOW_EDGE) return { start: false, end: false }
  return {
    start: rail.scrollLeft > OVERFLOW_EDGE,
    end: rail.scrollLeft < max - OVERFLOW_EDGE,
  }
}

function scrollTabIntoRail(rail, tab, instant) {
  if (!rail || !tab || rail.scrollWidth <= rail.clientWidth) return
  const railBox = rail.getBoundingClientRect()
  const tabBox = tab.getBoundingClientRect()
  if (!railBox.width) return
  const nextLeft =
    rail.scrollLeft + (tabBox.left - railBox.left) - (railBox.width - tabBox.width) / 2
  rail.scrollTo({
    left: Math.max(0, nextLeft),
    behavior: instant ? 'auto' : 'smooth',
  })
}

/**
 * Índice de la ficha: un panel a la vez (AthleteProfilePage).
 * En mobile es una cinta horizontal — el tab activo queda a la vista.
 *
 * `visibleIds` deja fuera las fichas condicionales (hoy sólo la oferta
 * exclusiva). Se filtra sobre ITEMS y no se reordena: el orden y la dirección
 * de la transición siguen saliendo de `ACCOUNT_TAB_IDS`.
 */
export default function AccountNav({ activeId, onChange, visibleIds = null }) {
  const { t } = useI18n()
  const items = visibleIds ? ITEMS.filter((item) => visibleIds.includes(item.id)) : ITEMS
  const { reducedMotion } = useMotionConfig()
  const railRef = useRef(null)
  const itemRefs = useRef(new Map())
  const [overflow, setOverflow] = useState({ start: false, end: false })

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    const updateOverflow = () => setOverflow(readOverflow(rail))
    updateOverflow()
    rail.addEventListener('scroll', updateOverflow, { passive: true })

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(updateOverflow) : null
    observer?.observe(rail)

    const onWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const max = rail.scrollWidth - rail.clientWidth
      if (max <= OVERFLOW_EDGE) return
      const goingRight = event.deltaY > 0
      if (
        (goingRight && rail.scrollLeft >= max - OVERFLOW_EDGE) ||
        (!goingRight && rail.scrollLeft <= OVERFLOW_EDGE)
      ) {
        return
      }
      event.preventDefault()
      rail.scrollLeft += event.deltaY
    }
    rail.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      rail.removeEventListener('scroll', updateOverflow)
      rail.removeEventListener('wheel', onWheel)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    scrollTabIntoRail(railRef.current, itemRefs.current.get(activeId), reducedMotion)
  }, [activeId, reducedMotion])

  return (
    <nav className="account-nav" aria-label={t('account.navAria')}>
      <div
        className="account-nav__viewport"
        data-overflow-start={overflow.start ? 'true' : 'false'}
        data-overflow-end={overflow.end ? 'true' : 'false'}
      >
        <LayoutGroup id="account-nav-tabs">
          <div className="account-nav__inner" role="tablist" ref={railRef}>
            {items.map(({ id, icon: Icon, labelKey }) => {
              const isActive = activeId === id

              return (
                <button
                  key={id}
                  ref={(node) => {
                    if (node) itemRefs.current.set(id, node)
                    else itemRefs.current.delete(id)
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab`}
                  aria-controls={id}
                  aria-selected={isActive}
                  className={`account-nav__item${isActive ? ' is-active' : ''}`}
                  onClick={() => onChange(id)}
                  onFocus={() =>
                    scrollTabIntoRail(railRef.current, itemRefs.current.get(id), reducedMotion)
                  }
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
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                    {t(`account.nav.${labelKey}`)}
                  </span>
                </button>
              )
            })}
          </div>
        </LayoutGroup>
      </div>
    </nav>
  )
}
