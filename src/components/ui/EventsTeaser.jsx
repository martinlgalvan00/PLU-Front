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
function useDecodedText(finalText, { active, delayMs }) {
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
  }, [active, delayMs, finalText])

  return text
}

/** Una línea del expediente. Lo que lee un lector de pantalla es el texto
 * real; lo que se ve (descifrándose o tachado) es decoración. */
function DossierField({ label, value, redacted, animate, index }) {
  const shown = useDecodedText(value, {
    active: animate,
    delayMs: DECODE_START_MS + index * DECODE_STAGGER_MS,
  })

  return (
    <div className="events-teaser__field">
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
