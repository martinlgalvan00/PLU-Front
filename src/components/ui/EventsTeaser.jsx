import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/events-teaser.css'

/**
 * EventsTeaser — PLU ARG
 *
 * Anuncio de "se viene otro torneo" sin fecha, sede ni nombre. La señal está
 * perdida a propósito: detrás del texto hay una card fantasma desenfocada
 * (formas, nunca datos) sobre un cielo de estrellas y nebulosa.
 *
 * No recibe ningún dato de evento. Lo que no existe no se puede filtrar: ni
 * por la red, ni por el código fuente, ni por el árbol de accesibilidad. Todo
 * lo decorativo va `aria-hidden`; lo único que leen los lectores de pantalla es
 * el titular y la bajada.
 *
 * Las animaciones (deriva de estrellas, barrido de señal) corren sólo mientras
 * el bloque está en pantalla y se apagan con `prefers-reduced-motion`; el CSS
 * se ocupa de esto último. El fondo sin animar ya es una composición completa.
 */
export default function EventsTeaser({ className = '' }) {
  const { t } = useI18n()
  const titleId = useId()
  const rootRef = useRef(null)
  const [inView, setInView] = useState(false)
  const [entered, setEntered] = useState(false)

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

      <div className="events-teaser__copy">
        <p className="events-teaser__eyebrow">
          <span className="events-teaser__pulse" aria-hidden />
          {t('pages.events.teaser.eyebrow')}
        </p>
        <h2 id={titleId} className="events-teaser__title">
          <span>{t('pages.events.teaser.titleLead')}</span>{' '}
          <span className="events-teaser__title-accent">
            {t('pages.events.teaser.titleAccent')}
          </span>
        </h2>
        <p className="events-teaser__lead">{t('pages.events.teaser.lead')}</p>
      </div>
    </section>
  )
}
