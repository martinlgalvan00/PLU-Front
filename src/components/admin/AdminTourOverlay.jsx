import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { modalTransition, drawerBackdropTransition } from '../../motion/variants.ts'
import { useAdminModal } from './useAdminModal.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const EDGE_MARGIN = 16
const TARGET_GAP = 14
const SPOTLIGHT_PAD = 6
const MISSING_TARGET_RETRY_MS = 350
const MISSING_TARGET_TIMEOUT_MS = 1400
/** En modo coach el blanco puede tardar: aparece cuando la persona pasa de
 *  sección del formulario. Se sigue buscando sin límite y se repone el rect
 *  periódicamente porque escribir en un campo cambia su alto (mensaje de
 *  error, ayuda inline) y el recuadro quedaba desalineado. */
const COACH_REFLOW_MS = 400

/**
 * ¿El campo señalado ya está completo? Sólo para campos reales: `null`
 * significa "esto no es un campo" y la tarjeta no muestra el pie de estado.
 */
function readFieldFilled(el) {
  if (!el) return null
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    if (!el.name) return el.checked
    return Boolean(document.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`))
  }
  const isField =
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  if (!isField) return null
  return el.value.trim().length > 0
}

/**
 * `frame` permite señalar el bloque completo del campo (`.field`, que envuelve
 * label + control + error) apuntando al control, que es lo único con un
 * selector estable — los campos de este proyecto no llevan `id`.
 */
function resolveFramed(el, frame) {
  if (!frame || !el) return el
  return el.closest(frame) ?? el
}

function measureRect(el, frame) {
  const framed = resolveFramed(el, frame)
  const r = framed.getBoundingClientRect()
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    radius: getComputedStyle(framed).borderRadius,
    filled: readFieldFilled(el),
  }
}

function useTargetRect(selector, stepKey, onMissing, { frame = null, coach = false } = {}) {
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!selector) return undefined
    let cancelled = false
    let firstSeenAt = null
    let raf = 0
    let reflowTimer = 0

    function measure() {
      if (cancelled) return
      const el = document.querySelector(selector)
      if (!el) {
        // En coach no se abandona el paso: el campo puede estar en la sección
        // siguiente del formulario y aparecer cuando la persona avanza.
        if (!coach) {
          firstSeenAt ??= Date.now()
          if (Date.now() - firstSeenAt > MISSING_TARGET_TIMEOUT_MS) {
            onMissing()
            return
          }
        }
        setRect(null)
        raf = window.setTimeout(measure, MISSING_TARGET_RETRY_MS)
        return
      }
      resolveFramed(el, frame).scrollIntoView({ block: 'center', behavior: 'auto' })
      if (!cancelled) setRect(measureRect(el, frame))
    }

    setRect(null)
    measure()

    function handleReflow() {
      const el = document.querySelector(selector)
      if (!el) return
      setRect(measureRect(el, frame))
    }

    if (coach) reflowTimer = window.setInterval(handleReflow, COACH_REFLOW_MS)
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)
    return () => {
      cancelled = true
      window.clearTimeout(raf)
      window.clearInterval(reflowTimer)
      window.removeEventListener('resize', handleReflow)
      window.removeEventListener('scroll', handleReflow, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stepKey fuerza remedir en cada paso nuevo
  }, [selector, stepKey, frame, coach])

  return rect
}

/**
 * El fondo del recorrido se dibuja como cuatro paneles alrededor del hueco
 * del spotlight en vez de una sola capa completa. Antes la capa tapaba todo
 * el panel -- incluido el elemento que el paso está señalando -- así que el
 * último paso del recorrido de inicio apuntaba al botón de ayuda y ese botón
 * no se podía tocar. Con el hueco abierto el recorrido sigue siendo modal
 * (el resto del panel no responde) pero el blanco señalado queda usable, y
 * un click en la zona oscurecida cancela el recorrido.
 *
 * En modo coach los mismos paneles se dibujan sin `pointer-events`: atenúan
 * el resto de la pantalla pero no bloquean nada, porque el tutorial acompaña
 * mientras la persona escribe y tiene que poder corregir un campo anterior.
 */
function TourBlockers({ rect, onCancel, coach }) {
  const shared = coach
    ? { className: 'admin-tour-blocker admin-tour-blocker--coach', 'aria-hidden': true }
    : { className: 'admin-tour-blocker', onClick: onCancel, 'aria-hidden': true }
  if (!rect) return <div {...shared} style={{ inset: 0 }} />

  const holeTop = Math.max(0, Math.floor(rect.top - SPOTLIGHT_PAD))
  const holeLeft = Math.max(0, Math.floor(rect.left - SPOTLIGHT_PAD))
  const holeRight = Math.ceil(rect.left + rect.width + SPOTLIGHT_PAD)
  const holeBottom = Math.ceil(rect.top + rect.height + SPOTLIGHT_PAD)
  const holeHeight = holeBottom - holeTop

  return (
    <>
      <div {...shared} style={{ top: 0, left: 0, right: 0, height: holeTop }} />
      <div {...shared} style={{ top: holeBottom, left: 0, right: 0, bottom: 0 }} />
      <div {...shared} style={{ top: holeTop, left: 0, width: holeLeft, height: holeHeight }} />
      <div {...shared} style={{ top: holeTop, left: holeRight, right: 0, height: holeHeight }} />
    </>
  )
}

function TourCard({
  rect,
  placement,
  step,
  index,
  total,
  isLastStep,
  coach,
  onNext,
  onPrev,
  onClose,
  reducedMotion,
}) {
  const { t } = useI18n()
  // Coach no atrapa el foco ni bloquea el scroll: la persona tiene que poder
  // tabular al campo señalado y escribir. El Escape lo cubre el overlay.
  const cardRef = useAdminModal(onClose, { active: !coach })
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
      className={`admin-tour-card${coach ? ' admin-tour-card--coach' : ''}`}
      role="dialog"
      aria-modal={coach ? undefined : 'true'}
      aria-labelledby="admin-tour-card-title"
      aria-describedby="admin-tour-card-body"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
      }
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

      {coach ? (
        <p className="admin-tour-card__field-state" role="status">
          {rect == null ? (
            t('admin.tour.coach.waiting')
          ) : rect.filled ? (
            <>
              <Check size={13} strokeWidth={3} aria-hidden />
              {t('admin.tour.coach.filled')}
            </>
          ) : (
            t('admin.tour.coach.pending')
          )}
        </p>
      ) : null}

      <div className="admin-tour-card__footer">
        <button type="button" className="admin-tour-card__skip" onClick={onClose}>
          {coach ? t('admin.tour.coach.exit') : t('admin.tour.skip')}
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
  const { activeTour, stepIndex, isLastStep, nextStep, prevStep, closeTour, skipStep } =
    useAdminTour()
  const { reducedMotion } = useMotionConfig()
  const step = activeTour?.steps[stepIndex] ?? null
  const coach = activeTour?.mode === 'coach'
  const rect = useTargetRect(
    step?.target ?? null,
    activeTour ? `${activeTour.id}:${stepIndex}` : null,
    skipStep,
    { frame: step?.frame ?? null, coach },
  )

  // Escape a nivel del recorrido y no solo de la tarjeta: mientras un paso
  // busca su blanco la tarjeta todavía no está montada y el fondo oscurecido
  // quedaba sin salida por teclado.
  useEffect(() => {
    if (!activeTour) return undefined
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      closeTour()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeTour, closeTour])

  if (!activeTour || !step) return null

  // Modal: sin blanco no hay tarjeta (el paso se saltea solo). Coach: la
  // tarjeta se muestra igual, centrada, esperando que el campo aparezca.
  const showCard = Boolean(rect) || coach

  return createPortal(
    <AnimatePresence>
      <m.div
        key="admin-tour-backdrop"
        className={`admin-tour-backdrop${coach ? ' admin-tour-backdrop--coach' : ''}`}
        initial={reducedMotion ? false : 'hidden'}
        animate="visible"
        exit="exit"
        variants={drawerBackdropTransition}
      >
        <TourBlockers rect={rect} onCancel={closeTour} coach={coach} />
        {rect ? (
          <div
            className="admin-tour-spotlight"
            style={{
              top: rect.top - SPOTLIGHT_PAD,
              left: rect.left - SPOTLIGHT_PAD,
              width: rect.width + SPOTLIGHT_PAD * 2,
              height: rect.height + SPOTLIGHT_PAD * 2,
              borderRadius: rect.radius && rect.radius !== '0px' ? rect.radius : '10px',
            }}
          />
        ) : null}
      </m.div>
      {showCard ? (
        <TourCard
          key={`admin-tour-card-${stepIndex}`}
          rect={rect}
          placement={step.placement ?? 'bottom'}
          step={step}
          index={stepIndex}
          total={activeTour.steps.length}
          isLastStep={isLastStep}
          coach={coach}
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
