import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { usePaymentModal } from '../checkout/usePaymentModal.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'

const STILL = { duration: 0 }

/**
 * El candado vive adentro del panel que sale: el scroll del body sigue
 * trabado hasta que termina la salida, y `display: contents` no mete
 * otra caja entre el overlay (flex) y el panel.
 */
function DialogLock({ onClose, children }) {
  const panelRef = usePaymentModal(onClose)
  return (
    <div ref={panelRef} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}

/**
 * Marco de los diálogos públicos que el checkout abre y cierra.
 * El overlay sigue siendo el que centra: el velo solo cambia opacidad
 * y el panel entra desde 12px. La salida es más corta y no se traslada
 * de lugar, para que el cierre se lea como desaparición y no como otro viaje.
 */
export default function PublicDialogFrame({
  open = true,
  onClose,
  overlayClassName,
  panelClassName,
  labelledBy,
  describedBy,
  ariaLabel,
  portal = false,
  children,
}) {
  const { reducedMotion } = useMotionConfig()
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  if (!mounted || typeof document === 'undefined') return null

  const enter = reducedMotion ? STILL : { duration: MOTION_DURATION.base, ease: MOTION_EASE.out }
  const leave = reducedMotion ? STILL : { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard }
  const panelEnter = reducedMotion
    ? STILL
    : { duration: MOTION_DURATION.base, ease: MOTION_EASE.cinematic }

  const scrimVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: enter },
    exit: { opacity: reducedMotion ? 1 : 0, transition: leave },
  }
  const panelVariants = {
    hidden: reducedMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: panelEnter },
    exit: reducedMotion
      ? { opacity: 1, y: 0, scale: 1, transition: STILL }
      : { opacity: 0, y: 8, scale: 0.99, transition: leave },
  }

  const tree = (
    <AnimatePresence>
      {open ? (
        <m.div
          key="public-dialog"
          className={overlayClassName}
          role="presentation"
          variants={scrimVariants}
          initial={reducedMotion ? false : 'hidden'}
          animate="visible"
          exit="exit"
          onMouseDown={onClose}
        >
          <m.section
            className={panelClassName}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-label={ariaLabel}
            variants={panelVariants}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DialogLock onClose={onClose}>{children}</DialogLock>
          </m.section>
        </m.div>
      ) : null}
    </AnimatePresence>
  )

  if (!portal) return tree
  return createPortal(tree, document.body)
}
