import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const APPEAR_AFTER_PX = 520
const HIDE_NEAR_BOTTOM_PX = 480

export default function StickyMobileCta({ onNavigate }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let rafId = null

    function tick() {
      rafId = null
      const scrollY = window.scrollY
      const distanceToBottom =
        document.documentElement.scrollHeight - (scrollY + window.innerHeight)
      setVisible(scrollY > APPEAR_AFTER_PX && distanceToBottom > HIDE_NEAR_BOTTOM_PX)
    }

    function onScroll() {
      if (rafId == null) rafId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className={`sticky-mobile-cta${visible ? ' is-visible' : ''}`}>
      <button
        type="button"
        className="sticky-mobile-cta__button"
        onClick={() => onNavigate('members')}
      >
        {t('hero.ctaAffiliate')}
        <ArrowRight size={15} aria-hidden />
      </button>
    </div>
  )
}
