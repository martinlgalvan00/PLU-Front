import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const APPEAR_AFTER_PX = 520
const HIDE_NEAR_BOTTOM_PX = 480

export default function StickyMobileCta({
  guideOpen = false,
  onNavigate,
  onOpenGuide,
  onBecameVisible,
}) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const wasVisibleRef = useRef(false)

  useEffect(() => {
    let rafId = null

    function tick() {
      rafId = null
      const scrollY = window.scrollY
      const distanceToBottom =
        document.documentElement.scrollHeight - (scrollY + window.innerHeight)
      const nextVisible = scrollY > APPEAR_AFTER_PX && distanceToBottom > HIDE_NEAR_BOTTOM_PX
      setVisible(nextVisible)
      if (nextVisible && !wasVisibleRef.current) {
        wasVisibleRef.current = true
        onBecameVisible?.()
      }
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
  }, [onBecameVisible])

  return (
    <div className={`sticky-mobile-cta${visible ? ' is-visible' : ''}`}>
      <div className="sticky-mobile-cta__bar">
        {onOpenGuide ? (
          <button
            type="button"
            className="sticky-mobile-cta__guide"
            aria-expanded={guideOpen}
            aria-haspopup="dialog"
            onClick={onOpenGuide}
          >
            {t('homeGuide.trigger')}
          </button>
        ) : null}
        <button
          type="button"
          className="sticky-mobile-cta__button"
          onClick={() => onNavigate('members')}
        >
          {t('hero.ctaAffiliate')}
          <ArrowRight className="sticky-mobile-cta__icon" size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
