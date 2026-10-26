import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { MOTION_DURATION, MOTION_EASE, scaleDuration } from './tokens'
import { pageSectionTransition } from './variants'
import { useMotionConfig } from './MotionProvider'
import { useMobileViewport } from './useMobileViewport'
import { isRouteMorphing } from './routeMorph'

const INSTANT = { duration: 0 }
const STILL_STATE = { opacity: 1, x: 0, y: 0 }
const STILL_EXIT = { opacity: 1, transition: INSTANT }

type RouteTransitionProps = {
  children: ReactNode
  viewKey: string
  direction?: 'forward' | 'back'
  id?: string
  tabIndex?: number
}

/**
 * En mobile la transición es direccional en X — el pulgar navega hacia
 * adelante/atrás y la página entra desde donde llegó el gesto: avanzar entra
 * desde la derecha (24px, presente), volver desde la izquierda (14px, leve).
 * La saliente siempre disuelve quieta: una sola superficie animada por vez,
 * sin empuje que duplique el movimiento.
 *
 * En desktop se mantiene el rise editorial vertical (variant compartida).
 */
export default function RouteTransition({
  children,
  viewKey,
  direction = 'forward',
  id,
  tabIndex,
}: RouteTransitionProps) {
  const { reducedMotion, tier } = useMotionConfig()
  const isMobile = useMobileViewport()

  /**
   * "No animar la página en la primera carga" es la intención correcta, pero
   * antes se expresaba con `<AnimatePresence initial={false}>` y eso tenía un
   * efecto que no se veía: `AnimatePresence` publica ese `false` en el
   * `PresenceContext`, y Motion lo lee como
   * `blockInitialAnimation: presenceContext.initial === false` para **todo
   * descendiente**, no sólo para la página. Resultado: cada `<Reveal>` de la
   * primera pantalla de la sesión montaba directamente en su estado visible —
   * su `initial="hidden"` se descartaba — y las apariciones por scroll no
   * ocurrían. Medido: `opacity: 1` y sin estilo inline antes y después de
   * scrollear; sacando el `initial={false}`, el mismo elemento aparecía en
   * `opacity: 0; translateY(...)` y asentaba en ~500ms.
   *
   * `AnimatePresence` sólo propaga ese bloqueo en su primer render
   * (`initial: !isInitialRender.current || initial` en su fuente), así que el
   * daño era exactamente la pantalla de entrada de cada sesión: la primera
   * impresión, y la página entera para quien llega directo por un link.
   *
   * La misma intención vive ahora en el `m.div`, donde `initial={false}`
   * significa "montá en el estado final sin animar" y no crea contexto de
   * presencia para nadie.
   */
  const isFirstRender = useRef(true)
  useEffect(() => {
    isFirstRender.current = false
  }, [])

  // Sin movimiento (reducido o equipo lento) la página cambia en seco, pero el
  // árbol es el mismo: antes devolvía un <div> en lugar del <m.div> y, como el
  // tier se mide en vivo los primeros segundos (MotionProvider), bajar a 'low'
  // con la página abierta la remontaba entera — se perdía lo cargado, como el
  // código aplicado en el checkout o "Elegir otro medio".
  const still = reducedMotion || tier === 'low'

  const mobileEnterX = direction === 'back' ? -14 : 24
  // Settle cinematográfico con la duración de página (0.34s) escalada por
  // tier: misma coreografía, menos tiempo de compositor en equipos que no
  // sostienen 60fps.
  const mobileDuration = scaleDuration(MOTION_DURATION.page, tier)

  const initial = isMobile
    ? { opacity: 0, x: mobileEnterX }
    : { opacity: 0, y: 14 }

  const exit = isMobile
    ? { opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard } }
    : {
        opacity: 0,
        y: direction === 'back' ? 6 : -3,
        transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard },
      }

  return (
    // Durante un morph de ruta la nueva monta junto a la saliente: con
    // `wait` la nueva esperaba una salida animada por rAF, que el navegador no
    // corre mientras la View Transition espera el DOM nuevo (routeMorph.ts).
    <AnimatePresence mode={isRouteMorphing() ? 'sync' : 'wait'}>
      <m.div
        key={viewKey}
        className={`page-transition ${still ? 'page-transition--idle' : 'page-transition--motion'}`}
        id={id}
        tabIndex={tabIndex}
        // Con un morph de ruta en curso (routeMorph.ts) la View Transition ya
        // es la entrada: la página monta quieta para que la captura nueva la
        // vea completa.
        initial={still || isRouteMorphing() || isFirstRender.current ? false : initial}
        animate={still ? STILL_STATE : isMobile ? { opacity: 1, x: 0 } : 'visible'}
        variants={still || isMobile ? undefined : pageSectionTransition}
        exit={still ? STILL_EXIT : exit}
        transition={
          still
            ? INSTANT
            : isMobile
              ? { duration: mobileDuration, ease: MOTION_EASE.cinematic }
              : undefined
        }
      >
        {children}
      </m.div>
    </AnimatePresence>
  )
}
