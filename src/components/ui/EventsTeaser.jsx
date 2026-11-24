import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import '../../styles/components/events-teaser.css'

/** Glifos con los que "se descifra" cada dato antes de asentarse. */
const GLYPHS = '▓▒░█/#%&'
const DECODE_MS = 950
const DECODE_STAGGER_MS = 260
/** Primer dato: cuando el titular ya terminó de enfocar. */
const DECODE_START_MS = 900
const FRAME_MS = 45
/** Cuando la entrada ya terminó (último dato descifrado) y se puede jugar. */
const SETTLE_MS = 2800
/** Cuánto del camino al cursor recorre el parallax por cuadro. */
const POINTER_EASE = 0.08

const FIELDS = [
  { key: 'date', redacted: true },
  { key: 'place' },
  { key: 'venue' },
  { key: 'status' },
]

function glyphFor(char) {
  return char === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
}

/** Texto que se resuelve de izquierda a derecha una sola vez. Sin `active`
 * (o con movimiento reducido) devuelve el texto final tal cual. */
function useDecodedText(finalText, { active, delayMs, run = 0 }) {
  const [text, setText] = useState(finalText)

  useEffect(() => {
    if (!active) {
      setText(finalText)
      return undefined
    }
    setText(Array.from(finalText, glyphFor).join(''))

    let frameId = 0
    let lastPaint = 0
    let startedAt = 0
    const tick = (now) => {
      if (!startedAt) startedAt = now
      const progress = Math.min(1, (now - startedAt) / DECODE_MS)
      if (now - lastPaint >= FRAME_MS || progress === 1) {
        lastPaint = now
        const settled = Math.floor(progress * finalText.length)
        setText(
          Array.from(finalText, (char, index) => (index < settled ? char : glyphFor(char))).join(
            '',
          ),
        )
      }
      if (progress < 1) frameId = window.requestAnimationFrame(tick)
      else setText(finalText)
    }
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(tick)
    }, delayMs)

    return () => {
      window.clearTimeout(timerId)
      window.cancelAnimationFrame(frameId)
    }
  }, [active, delayMs, finalText, run])

  return text
}

/** Una línea del expediente. Lo que lee un lector de pantalla es el texto
 * real; lo que se ve (descifrándose o tachado) es decoración. Con el cursor
 * encima, el dato vuelve a descifrarse (`replayable`): es un guiño, no un
 * dato nuevo, el valor final es siempre el mismo. */
function DossierField({ label, value, redacted, animate, replayable, index }) {
  const [run, setRun] = useState(0)
  const shown = useDecodedText(value, {
    active: animate,
    delayMs: run === 0 ? DECODE_START_MS + index * DECODE_STAGGER_MS : 0,
    run,
  })

  return (
    <div
      className="events-teaser__field"
      onPointerEnter={replayable ? () => setRun((count) => count + 1) : undefined}
    >
      <dt>{label}</dt>
      <dd>
        <span className="visually-hidden">{value}</span>
        <span
          className={`events-teaser__value${redacted ? ' events-teaser__value--redacted' : ''}`}
          aria-hidden
        >
          {shown}
        </span>
      </dd>
    </div>
  )
}

/**
 * EventsTeaser — PLU ARG
 *
 * Anuncio de "se viene otro torneo" sin fecha, sede ni nombre, armado como el
 * tráiler de una película: encuadre con bandas de cine, titular que enfoca de
 * borroso a nítido y un expediente cuyos datos se descifran para quedar en
 * "desconocida", "clasificada", "sin anunciar". Detrás, una card fantasma
 * desenfocada (formas, nunca datos) sobre un cielo de estrellas y nebulosa.
 *
 * No recibe ningún dato de evento. Lo que no existe no se puede filtrar: ni
 * por la red, ni por el código fuente, ni por el árbol de accesibilidad. Los
 * valores del expediente son la ausencia de dato dicha en voz alta, no un dato
 * escondido. Todo lo decorativo va `aria-hidden`.
 *
 * Las animaciones corren sólo mientras el bloque está en pantalla y se apagan
 * con `prefers-reduced-motion`; el CSS se ocupa de esto último. El bloque sin
 * animar ya es una composición completa.
 */
export default function EventsTeaser({ className = '' }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const titleId = useId()
  const rootRef = useRef(null)
  const [inView, setInView] = useState(false)
  const [entered, setEntered] = useState(false)
  const animate = entered && !reducedMotion && tier !== 'low'

  // El expediente sólo se vuelve a descifrar cuando terminó la entrada.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!animate) return undefined
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [animate])

  // El cielo responde al cursor: parallax por capas y una luz que lo sigue.
  // Sólo con mouse (no hay "cursor" en touch), a la vista y con movimiento.
  const interactive = inView && animate
  useEffect(() => {
    const node = rootRef.current
    if (!node || !interactive) return undefined
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined

    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let frameId = 0
    let inside = false

    const paint = () => {
      current.x += (target.x - current.x) * POINTER_EASE
      current.y += (target.y - current.y) * POINTER_EASE
      node.style.setProperty('--teaser-px', current.x.toFixed(4))
      node.style.setProperty('--teaser-py', current.y.toFixed(4))
      const moving =
        Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001
      frameId = moving ? window.requestAnimationFrame(paint) : 0
    }
    const schedule = () => {
      if (!frameId) frameId = window.requestAnimationFrame(paint)
    }
    const onMove = (event) => {
      const rect = node.getBoundingClientRect()
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
      node.style.setProperty('--teaser-mx', `${event.clientX - rect.left}px`)
      node.style.setProperty('--teaser-my', `${event.clientY - rect.top}px`)
      if (!inside) {
        inside = true
        node.dataset.pointer = 'true'
      }
      schedule()
    }
    const onLeave = () => {
      inside = false
      target.x = 0
      target.y = 0
      delete node.dataset.pointer
      schedule()
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      window.cancelAnimationFrame(frameId)
      delete node.dataset.pointer
      node.style.removeProperty('--teaser-px')
      node.style.removeProperty('--teaser-py')
    }
  }, [interactive])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return undefined
    // Sin IntersectionObserver (tests, navegadores viejos) el bloque se ve
    // entero y quieto: mejor sin movimiento que sin anuncio.
    if (typeof IntersectionObserver === 'undefined') {
      setEntered(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
        if (entry.isIntersecting) setEntered(true)
      },
      { threshold: 0.18 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const titleLead = t('pages.events.teaser.titleLead')
  const titleAccent = t('pages.events.teaser.titleAccent')

  return (
    <section
      ref={rootRef}
      className={[
        'events-teaser',
        entered ? 'is-entered' : '',
        inView ? 'is-live' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
    >
      <div className="events-teaser__sky" aria-hidden>
        <span className="events-teaser__nebula events-teaser__nebula--a" />
        <span className="events-teaser__nebula events-teaser__nebula--b" />
        <span className="events-teaser__stars events-teaser__stars--far" />
        <span className="events-teaser__stars events-teaser__stars--near" />
        {/* Una sola estrella fugaz al entrar: marca el momento, no se repite. */}
        <span className="events-teaser__meteor" aria-hidden />
      </div>

      {/* Card fantasma: la silueta de una EventCard hecha de bloques, para que el
          ojo lea "evento" sin que haya nada que leer. */}
      <div className="events-teaser__ghost" aria-hidden>
        {[0, 1, 2].map((row) => (
          <div className="events-teaser__ghost-row" key={row}>
            <span className="events-teaser__ghost-date" />
            <span className="events-teaser__ghost-body">
              <span className="events-teaser__ghost-bar events-teaser__ghost-bar--status" />
              <span className="events-teaser__ghost-bar events-teaser__ghost-bar--title" />
              <span className="events-teaser__ghost-bar events-teaser__ghost-bar--meta" />
            </span>
            <span className="events-teaser__ghost-action" />
          </div>
        ))}
      </div>

      {/* Luz que sigue al cursor: ilumina la card fantasma sin revelarla. */}
      <span className="events-teaser__spot" aria-hidden />

      <div className="events-teaser__signal" aria-hidden>
        <span className="events-teaser__static" />
        <span className="events-teaser__sweep" />
      </div>

      {/* Bandas de cine: encuadran la pieza como un fotograma. */}
      <span className="events-teaser__letterbox events-teaser__letterbox--top" aria-hidden />
      <span className="events-teaser__letterbox events-teaser__letterbox--bottom" aria-hidden />

      <div className="events-teaser__copy">
        <p className="events-teaser__eyebrow">
          <span className="events-teaser__pulse" aria-hidden />
          {t('pages.events.teaser.eyebrow')}
        </p>

        <div className="events-teaser__headline">
          <h2 id={titleId} className="events-teaser__title">
            <span>{titleLead}</span>{' '}
            <span className="events-teaser__title-accent">{titleAccent}</span>
          </h2>
          {/* Copia desenfocada del titular: el enfoque es una caída de opacidad
              (el filtro es estático), así no se anima `filter`. */}
          <p className="events-teaser__haze events-teaser__title" aria-hidden>
            {titleLead} <span className="events-teaser__title-accent">{titleAccent}</span>
          </p>
        </div>

        <p className="events-teaser__lead">{t('pages.events.teaser.lead')}</p>

        <dl className="events-teaser__dossier" aria-label={t('pages.events.teaser.dossierLabel')}>
          {FIELDS.map((field, index) => (
            <DossierField
              key={field.key}
              index={index}
              animate={animate}
              replayable={settled && !field.redacted}
              redacted={field.redacted}
              label={t(`pages.events.teaser.fields.${field.key}`)}
              value={t(`pages.events.teaser.fields.${field.key}Value`)}
            />
          ))}
        </dl>
      </div>
    </section>
  )
}
