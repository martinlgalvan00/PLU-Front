import { useMemo, useRef } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { LIFT_KEYS, liftsForModality } from '../../lib/pitbullCategories.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_VIEWPORT } from '../../motion/tokens.ts'
import { useStepBand } from '../../motion/useStepBand.ts'
import { staggerContainer, staggerItem } from '../../motion/variants.ts'
import '../../styles/components/meet-surface.css'
import '../../styles/pages/pitbull-categories-film.css'
import BarbellLoad from './BarbellLoad.jsx'
import GearScene from './PitbullGearScene.jsx'

const pad2 = (value) => String(value).padStart(2, '0')

/** Escena 1 — Modalidades: tres estaciones; se encienden las que incluye la modalidad. */
function LiftsScene({ rows, rowIndex, t }) {
  const included = new Set(liftsForModality(rows[rowIndex]))

  return (
    <div className="film-lifts">
      {LIFT_KEYS.map((key, index) => (
        <div
          key={key}
          className="film-lift"
          data-on={included.has(key) ? 'true' : 'false'}
          style={{ '--i': index }}
        >
          <BarbellLoad
            className="film-lift__bar"
            count={3}
            stepMs={160}
            delay={0.2 + index * 0.15}
          />
          <span className="film-lift__name">{t(`pages.pitbull.categoriesLifts.${key}`)}</span>
          <span className="film-lift__mark" aria-hidden />
        </div>
      ))}
    </div>
  )
}

/** Escena 3 — Divisiones: línea de edades; Open abarca todo el recorrido. */
function AgeScene({ rows, rowIndex }) {
  const isOpen = (name) => /open/i.test(name)
  const ranked = rows.filter((row) => !isOpen(row))
  const active = rows[rowIndex]
  const openActive = isOpen(active)

  return (
    <div className="film-age" data-open={openActive ? 'true' : 'false'}>
      <m.span
        className="film-age__track"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, ease: MOTION_EASE.cinematic, delay: 0.15 }}
      />
      <div className="film-age__nodes" style={{ '--n': ranked.length }}>
        {ranked.map((row) => (
          <div
            key={row}
            className="film-age__node"
            data-on={openActive || row === active ? 'true' : 'false'}
          >
            <span className="film-age__dot" />
            <span className="film-age__label">{row}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SCENES = [LiftsScene, GearScene, AgeScene]

/**
 * Categorías como un pequeño film: un reproductor fijo que acompaña la lectura
 * de tres capítulos (Modalidades → Equipamiento → Divisiones) y reacciona a la
 * fila que se está leyendo. El texto de cada fila es el contenido real; la
 * escena es ilustración (aria-hidden).
 *
 * Reduced motion / tier low: solo la lista de capítulos, sin reproductor.
 */
export default function PitbullCategoriesFilm({ acts }) {
  const { t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const rootRef = useRef(null)

  const flat = useMemo(
    () =>
      acts.flatMap((act, actIndex) =>
        act.rows.map((row, rowIndex) => ({ actIndex, rowIndex, row })),
      ),
    [acts],
  )
  const { activeIndex, bind } = useStepBand(flat.length, {
    enabled: !still,
    rootMargin: '-46% 0px -46% 0px',
  })
  const current = flat[Math.min(activeIndex, flat.length - 1)] ?? flat[0]
  const act = acts[current.actIndex]
  const Scene = SCENES[current.actIndex] ?? LiftsScene

  const List = still ? 'ol' : m.ol
  const Item = still ? 'li' : m.li
  const listProps = still
    ? {}
    : {
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
        variants: staggerContainer,
      }

  let flatCursor = 0

  return (
    <div className="pitbull-film" ref={rootRef} data-stage={still ? undefined : 'true'}>
      <div className="pitbull-film__script">
        {acts.map((entry, actIndex) => (
          <section
            key={entry.id}
            className="pitbull-film__act"
            aria-labelledby={`pitbull-cat-${entry.id}`}
          >
            <header className="pitbull-film__act-head">
              <span className="pitbull-film__act-index" aria-hidden>
                {pad2(actIndex + 1)}
              </span>
              <h3 id={`pitbull-cat-${entry.id}`} className="pitbull-film__act-title">
                {entry.label}
              </h3>
              <p className="pitbull-film__act-hint">{entry.hint}</p>
            </header>

            <List className="pitbull-film__rows" {...listProps}>
              {entry.rows.map((row, rowIndex) => {
                const flatIndex = flatCursor
                flatCursor += 1
                const isActive = !still && flatIndex === activeIndex
                return (
                  <Item
                    key={row}
                    ref={still ? undefined : bind(flatIndex)}
                    className="pitbull-film__row"
                    data-active={isActive ? 'true' : undefined}
                    {...(still ? {} : { variants: staggerItem })}
                  >
                    <span className="pitbull-film__row-index" aria-hidden>
                      {pad2(rowIndex + 1)}
                    </span>
                    <span className="pitbull-film__row-name">{row}</span>
                  </Item>
                )
              })}
            </List>
          </section>
        ))}
      </div>

      {still ? null : (
        <div className="pitbull-film__stage" aria-hidden>
          <div className="film-screen meet-surface">
            <div className="film-screen__bar">
              <span className="film-screen__chapters">
                {acts.map((entry, index) => (
                  <span
                    key={entry.id}
                    className="film-screen__chapter"
                    data-state={
                      index === current.actIndex
                        ? 'active'
                        : index < current.actIndex
                          ? 'past'
                          : 'next'
                    }
                  >
                    {entry.label}
                  </span>
                ))}
              </span>
            </div>

            <div className="film-screen__scene">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={current.actIndex}
                  className="film-screen__scene-inner"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
                >
                  <Scene rows={act.rows} rowIndex={current.rowIndex} t={t} />
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
