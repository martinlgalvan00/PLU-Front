import { AnimatePresence, m } from 'motion/react'
import { GEAR_SETS, gearKind } from '../../lib/pitbullCategories.js'
import { MOTION_EASE } from '../../motion/tokens.ts'

/* Equipamiento en tres tiempos, leído del nombre que carga el contenido:
   · Raw → rodilleras, muñequeras y cinturón.
   · Raw con vendas → lo mismo, pero con vendas en lugar de rodilleras.
   · Single ply / Multi ply / Sin límite → capas de equipo (una, varias, sin tope).
   Las piezas que se repiten entre Raw y Raw con vendas no se redibujan: solo
   cambia la primera, así se lee qué es lo que cambia. */

const GLYPHS = {
  kneeSleeves: [
    'M20 9 L44 9 L47 55 L17 55 Z',
    'M20 9 Q32 15 44 9',
    'M17 55 Q32 61 47 55',
    'M32 15 V55',
    'M18.3 32 H45.7',
  ],
  kneeWraps: [
    'M22 10 H42 V56 H22 Z',
    'M22 10 Q32 5 42 10',
    'M22 18 L42 24',
    'M22 28 L42 34',
    'M22 38 L42 44',
    'M42 56 Q51 58 53 49',
  ],
  wristWraps: [
    'M14 18 H50 Q56 18 56 24 V40 Q56 46 50 46 H14 Z',
    'M14 24 C3 24 3 40 14 40',
    'M42 18 V46',
    'M47 18 V46',
    'M52 18 V46',
    'M20 28 H36',
    'M20 36 H36',
  ],
  belt: [
    'M8 20 H56 Q58 20 58 22 V42 Q58 44 56 44 H8 Q6 44 6 42 V22 Q6 20 8 20 Z',
    'M24 26 H38 V38 H24 Z',
    'M28 30 H34 V34 H28 Z',
    'M44 29 V35',
    'M49 29 V35',
  ],
}

/** Pieza dibujada a trazo: las líneas se trazan una tras otra y aparece el rótulo. */
function GearItem({ id, label, order }) {
  const delay = 0.15 + order * 0.2

  return (
    <m.div
      className="film-gear__item"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.25, ease: MOTION_EASE.out } }}
      transition={{ duration: 0.6, ease: MOTION_EASE.out, delay }}
    >
      <svg className="film-gear__glyph" viewBox="0 0 64 64" focusable="false" aria-hidden>
        {GLYPHS[id].map((d, index) => (
          <m.path
            key={d}
            d={d}
            pathLength={1}
            style={{ strokeDasharray: 1 }}
            initial={{ strokeDashoffset: 1 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{
              duration: 0.9,
              ease: MOTION_EASE.cinematic,
              delay: delay + 0.1 + index * 0.1,
            }}
          />
        ))}
      </svg>
      <span className="film-gear__label">{label}</span>
    </m.div>
  )
}

/** Capas de equipo: una, varias o sin tope (las últimas se desvanecen hacia arriba). */
function PlyStack({ kind, label }) {
  const count = kind === 'single' ? 1 : kind === 'multi' ? 3 : 5
  const fadeOf = (index) => (kind === 'open' ? Math.max(0.2, 1 - index * 0.2) : 1)

  return (
    <m.div
      className="film-gear__plies"
      data-kind={kind}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="film-gear__stack">
        {Array.from({ length: count }, (_, index) => (
          <m.span
            key={index}
            className="film-gear__ply"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: fadeOf(index) }}
            transition={{ duration: 0.8, ease: MOTION_EASE.cinematic, delay: 0.2 + index * 0.16 }}
          />
        ))}
      </div>
      <span className="film-gear__label">{label}</span>
    </m.div>
  )
}

export default function GearScene({ rows, rowIndex, t }) {
  const kind = gearKind(rows[rowIndex])
  const items = GEAR_SETS[kind]
  const labels = {
    kneeSleeves: t('pages.pitbull.categoriesGear.kneeSleeves'),
    kneeWraps: t('pages.pitbull.categoriesGear.kneeWraps'),
    wristWraps: t('pages.pitbull.categoriesGear.wristWraps'),
    belt: t('pages.pitbull.categoriesGear.belt'),
  }
  const plyLabel = {
    single: t('pages.pitbull.categoriesGear.plyOne'),
    multi: t('pages.pitbull.categoriesGear.plyMany'),
    open: t('pages.pitbull.categoriesGear.plyOpen'),
  }[kind]

  const group = items ? 'items' : 'plies'

  return (
    // Un cambio de grupo (piezas ↔ capas) funde; dentro del grupo cambian solo las piezas.
    <AnimatePresence mode="wait" initial>
      <m.div
        key={group}
        className={`film-gear${items ? ' film-gear--items' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      >
        {items ? (
          items.map((id, slot) => (
            // Un presencia por casilla: Raw → Raw con vendas solo reemplaza la primera.
            <AnimatePresence key={slot} mode="wait" initial>
              <GearItem key={id} id={id} label={labels[id]} order={slot} />
            </AnimatePresence>
          ))
        ) : (
          <AnimatePresence mode="wait" initial>
            <PlyStack key={kind} kind={kind} label={plyLabel} />
          </AnimatePresence>
        )}
      </m.div>
    </AnimatePresence>
  )
}
