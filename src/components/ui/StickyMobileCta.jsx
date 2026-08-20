import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const APPEAR_AFTER_PX = 520
const HIDE_NEAR_BOTTOM_PX = 480
/** Alto real de la barra (48px de botón + 20px de padding) más aire. */
const CLEARANCE_PX = '76px'

export default function StickyMobileCta({ onNavigate, onBecameVisible }) {
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

  // El botón de ayuda (`HelpDock`) es fijo y comparte esta esquina en mobile.
  // Publicar el alto de la barra como variable es el acoplamiento más chico
  // que evita que se pisen: la barra no conoce al botón y el botón no conoce
  // a la portada, sólo leen el mismo token.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--sticky-cta-clearance', visible ? CLEARANCE_PX : '0px')
    return () => root.style.removeProperty('--sticky-cta-clearance')
  }, [visible])

  return (
    <div className={`sticky-mobile-cta${visible ? ' is-visible' : ''}`}>
      <div className="sticky-mobile-cta__bar">
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
