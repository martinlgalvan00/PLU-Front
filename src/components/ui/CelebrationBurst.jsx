import '../../styles/components/celebration-burst.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  buildCelebrationPieces,
  celebrationPieceCount,
  markCelebrated,
  shouldCelebrate,
} from '../../lib/celebration.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

/**
 * CelebrationBurst — PLU ARG
 *
 * La ráfaga que acompaña al sello en los tres momentos en que alguien pasa a
 * formar parte de la federación: la afiliación queda acreditada, la credencial
 * con QR se emite, la inscripción al meet queda confirmada.
 *
 * Es confeti, pero de esta marca: papel laminado en oro PLU con celeste de
 * acompañamiento y grafito de peso, un solo disparo de ~1,2 s, sin glow, sin
 * blur, sin loop y sin nada girando cuando termina. La ráfaga sale del sello
 * —no del borde de la pantalla— porque lo que se festeja es ese acuse, no la
 * navegación.
 *
 * ── Por qué portal a `document.body` ──
 * `position: fixed` se mide contra el viewport salvo que un ancestro tenga
 * `transform`, `filter`, `backdrop-filter` o `contain` — y el sello vive
 * exactamente ahí: la confirmación de afiliación entra con `m.section`
 * (transform por variantes de Motion) dentro de una superficie
 * `auth-immersive-glass`. Sin el portal, el origen medido en coordenadas de
 * viewport se aplicaba contra la caja de ese ancestro y la ráfaga salía
 * desplazada. Con portal a `body` la capa vuelve a ser del viewport y las
 * variables de tema siguen llegando: `data-theme` vive en `documentElement`.
 *
 * ── Por qué `position: fixed` ──
 * Una ráfaga que crece dentro del bloque obliga a elegir entre recortarla
 * (queda un rectángulo de papel) o dejarla desbordar (scroll horizontal en
 * 360px). Acá el escenario es una capa fija del tamaño del viewport con
 * `overflow: hidden`: no participa del layout, no puede desbordar en ninguna
 * resolución, y el origen se mide del elemento ancla en el momento del
 * disparo, así que la ráfaga sale del sello real y no de una coordenada
 * adivinada. Queda por debajo del header (`z-index` 190 contra 200): papel
 * volando sobre la navegación se lee como banner publicitario, no como acuse.
 *
 * ── Por qué el ancla se observa antes de disparar ──
 * `RegisterPage` monta el bloque de confirmación dos veces —el aside de
 * desktop y el contexto mobile viven los dos en el DOM y se apagan por
 * `display: none` según el breakpoint—, así que sin esta condición salían dos
 * ráfagas: una del sello visible y otra desde el centro del viewport, porque
 * un nodo oculto mide 0. El `IntersectionObserver` resuelve las dos cosas de
 * una: solo festeja el sello que la persona está viendo, y espera a que entre
 * en pantalla si la sección está más abajo (el caso de la credencial en la
 * cuenta).
 *
 * ── Accesibilidad y respeto por el usuario ──
 * `aria-hidden` y `pointer-events: none`: la confirmación siempre está también
 * en texto y en `role="status"`, la ráfaga no aporta información. Bajo
 * `prefers-reduced-motion` no se monta un solo nodo (la puerta es
 * `shouldCelebrate`, no un `@media` que igual dibuja). En tier `low` baja de
 * 22 piezas a 10 en vez de desaparecer. Al terminar se desmonta sola: no
 * quedan 22 nodos en el árbol esperando el próximo render.
 *
 * @param {object} props
 * @param {boolean} props.active   El hecho está confirmado de verdad. Nunca
 *   pasar `true` con una orden pendiente: festejar un pago que el banco puede
 *   rechazar es peor que no festejar.
 * @param {{current: HTMLElement|null}} [props.anchorRef] Elemento del que sale
 *   la ráfaga (el sello). Sin ancla, sale del tercio superior del viewport.
 * @param {string} [props.playKey] Clave de "una sola vez", para superficies que
 *   la persona vuelve a visitar (la credencial en su cuenta). Sin clave la
 *   ráfaga se dispara en cada montaje, que es lo correcto en una pantalla de
 *   confirmación a la que se llega una vez.
 * @param {number} [props.delayMs] Espera entre que el ancla entra en pantalla y
 *   el disparo. Existe por coreografía: el sello tarda ~620 ms en trazar el
 *   anillo y dibujar el check, y el papel tiene que salir con el sello ya
 *   estampado. Disparar junto con el montaje hacía que los dos gestos
 *   compitieran y ninguno se leyera.
 */

/** Delay + duración máximos de la tabla (160 + 1380), con margen de desmontaje. */
const BURST_LIFETIME_MS = 1750

/** Cuánto del sello tiene que estar en pantalla para que valga la pena. */
const ANCHOR_VISIBLE_RATIO = 0.4

export default function CelebrationBurst({
  active = false,
  anchorRef = null,
  playKey,
  delayMs = 0,
}) {
  const { reducedMotion, tier } = useMotionConfig()
  const [phase, setPhase] = useState('idle')
  const [origin, setOrigin] = useState(null)
  // Persiste entre los montajes simulados de StrictMode: sin esto el segundo
  // pase veía la clave ya marcada y la ráfaga no salía nunca en desarrollo.
  const startedRef = useRef(false)

  const pieces = useMemo(() => buildCelebrationPieces(celebrationPieceCount(tier)), [tier])

  useEffect(() => {
    if (startedRef.current || phase !== 'idle') return undefined
    if (!shouldCelebrate({ active, reducedMotion, playKey })) return undefined

    let timer = 0
    let observer = null

    function fire() {
      if (startedRef.current) return
      startedRef.current = true
      if (playKey) markCelebrated(playKey)

      // El origen se mide al disparar, no al montar: el sello entra con un
      // `scale` de 480 ms y su caja recién es la definitiva cuando el gesto
      // arranca. Después la capa es fija y nada se mueve durante el vuelo.
      const rect = anchorRef?.current?.getBoundingClientRect?.()
      if (rect && rect.width > 0) {
        setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }
      setPhase('playing')
    }

    function schedule() {
      if (delayMs <= 0) {
        fire()
        return
      }
      timer = window.setTimeout(fire, delayMs)
    }

    const node = anchorRef?.current
    // Sin ancla o sin IntersectionObserver (jsdom) la ráfaga se dispara igual:
    // el festejo nunca depende de una API opcional.
    if (!node || typeof IntersectionObserver !== 'function') {
      schedule()
      return () => window.clearTimeout(timer)
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        schedule()
      },
      { threshold: ANCHOR_VISIBLE_RATIO },
    )
    observer.observe(node)

    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [active, anchorRef, delayMs, phase, playKey, reducedMotion])

  useEffect(() => {
    if (phase !== 'playing') return undefined
    const timer = window.setTimeout(() => setPhase('done'), BURST_LIFETIME_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase !== 'playing') return null
  if (typeof document === 'undefined') return null

  const burst = (
    <div
      className="celebration-burst"
      aria-hidden="true"
      style={
        origin
          ? { '--celebration-origin-x': `${origin.x}px`, '--celebration-origin-y': `${origin.y}px` }
          : undefined
      }
    >
      <div className="celebration-burst__origin">
        {pieces.map((piece) => (
          <span
            key={piece.id}
            className={`celebration-burst__piece celebration-burst__piece--${piece.tone}`}
            style={{
              '--burst-px': piece.px,
              '--burst-py': piece.py,
              '--burst-reach': piece.reach,
              '--burst-fall': piece.fall,
              '--burst-spin': `${piece.spin}deg`,
              // Sin unidad a propósito: son múltiplos de `--celebration-unit`,
              // el clamp() que escala el papel con el viewport. Con `px` acá el
              // calc del CSS quedaba en px² y la pieza salía con altura 0.
              '--burst-width': piece.width,
              '--burst-height': piece.height,
              '--burst-delay': `${piece.delay}ms`,
              '--burst-duration': `${piece.duration}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )

  return createPortal(burst, document.body)
}
