import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { modalTransition, drawerBackdropTransition } from '../../motion/variants.ts'
import { useAdminModal } from './useAdminModal.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const EDGE_MARGIN = 16
const TARGET_GAP = 14
const MISSING_TARGET_RETRY_MS = 350
const MISSING_TARGET_TIMEOUT_MS = 1400

function useTargetRect(selector, stepKey, onMissing) {
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!selector) return undefined
    let cancelled = false
    let firstSeenAt = null
    let raf = 0

    function measure() {
      if (cancelled) return
      const el = document.querySelector(selector)
      if (!el) {
        firstSeenAt ??= Date.now()
        if (Date.now() - firstSeenAt > MISSING_TARGET_TIMEOUT_MS) {
          onMissing()
          return
        }
        raf = window.setTimeout(measure, MISSING_TARGET_RETRY_MS)
        return
      }
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
      const r = el.getBoundingClientRect()
      if (!cancelled) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, radius: getComputedStyle(el).borderRadius })
      }
    }

    setRect(null)
    measure()

    function handleReflow() {
      const el = document.querySelector(selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height, radius: getComputedStyle(el).borderRadius })
    }

    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)
    return () => {
      cancelled = true
      window.clearTimeout(raf)
      window.removeEventListener('resize', handleReflow)
      window.removeEventListener('scroll', handleReflow, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stepKey fuerza remedir en cada paso nuevo
  }, [selector, stepKey])

  return rect
}

function TourCard({ rect, placement, step, index, total, isLastStep, onNext, onPrev, onClose, reducedMotion }) {
  const { t } = useI18n()
  const cardRef = useAdminModal(onClose)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !rect) {
      setPos(null)
      return
    }
    const cardRect = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let top
    let left

    if (placement === 'top') {
      top = rect.top - TARGET_GAP - cardRect.height
      left = rect.left + rect.width / 2 - cardRect.width / 2
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - cardRect.height / 2
      left = rect.left - TARGET_GAP - cardRect.width
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - cardRect.height / 2
      left = rect.left + rect.width + TARGET_GAP
    } else {
      top = rect.top + rect.height + TARGET_GAP
      left = rect.left + rect.width / 2 - cardRect.width / 2
    }

    top = Math.min(Math.max(top, EDGE_MARGIN), vh - cardRect.height - EDGE_MARGIN)
    left = Math.min(Math.max(left, EDGE_MARGIN), vw - cardRect.width - EDGE_MARGIN)
    setPos({ top, left })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cardRef.current no dispara re-medición sola
  }, [rect, placement])

  return (
    <m.div
      ref={cardRef}
      className="admin-tour-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-tour-card-title"
      aria-describedby="admin-tour-card-body"
      style={pos ? { top: pos.top, left: pos.left } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      initial={reducedMotion ? false : 'hidden'}
      animate="visible"
      exit="exit"
      variants={modalTransition}
    >
      <button
        type="button"
        className="admin-tour-card__close"
        onClick={onClose}
        aria-label={t('admin.tour.close')}
      >
        <X size={14} aria-hidden />
      </button>

      <span className="admin-tour-card__step" aria-hidden>
        {t('admin.tour.stepOf', { current: index + 1, total })}
      </span>
      <h2 id="admin-tour-card-title" className="admin-tour-card__title">
        {step.title}
      </h2>
      <p id="admin-tour-card-body" className="admin-tour-card__body">
        {step.body}
      </p>

      <div className="admin-tour-card__footer">
        <button type="button" className="admin-tour-card__skip" onClick={onClose}>
          {t('admin.tour.skip')}
        </button>
        <div className="admin-tour-card__nav">
          {index > 0 ? (
            <button type="button" className="admin-tour-card__prev" onClick={onPrev}>
              <ArrowLeft size={14} aria-hidden />
              {t('admin.tour.back')}
            </button>
          ) : null}
          <button type="button" className="admin-tour-card__next" onClick={onNext}>
            {isLastStep ? t('admin.tour.finish') : t('admin.tour.next')}
            {!isLastStep ? <ArrowRight size={14} aria-hidden /> : null}
          </button>
        </div>
      </div>
    </m.div>
  )
}

export default function AdminTourOverlay() {
  const { activeTour, stepIndex, isLastStep, nextStep, prevStep, closeTour, skipStep } = useAdminTour()
  const { reducedMotion } = useMotionConfig()
  const step = activeTour?.steps[stepIndex] ?? null
  const rect = useTargetRect(step?.target ?? null, activeTour ? `${activeTour.id}:${stepIndex}` : null, skipStep)

  if (!activeTour || !step) return null

  return createPortal(
    <AnimatePresence>
      <m.div
        key="admin-tour-backdrop"
        className="admin-tour-backdrop"
        initial={reducedMotion ? false : 'hidden'}
        animate="visible"
        exit="exit"
        variants={drawerBackdropTransition}
      >
        {rect ? (
          <div
            className="admin-tour-spotlight"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              borderRadius: rect.radius && rect.radius !== '0px' ? rect.radius : '10px',
            }}
          />
        ) : null}
      </m.div>
      {rect ? (
        <TourCard
          key={`admin-tour-card-${stepIndex}`}
          rect={rect}
          placement={step.placement ?? 'bottom'}
          step={step}
          index={stepIndex}
          total={activeTour.steps.length}
          isLastStep={isLastStep}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={closeTour}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
