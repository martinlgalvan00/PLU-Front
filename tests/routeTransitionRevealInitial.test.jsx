import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import Reveal from '../src/motion/Reveal.tsx'
import RouteTransition from '../src/motion/RouteTransition.tsx'

/**
 * `AnimatePresence initial={false}` desactiva la animación de entrada de la
 * página en la primera carga — intención correcta— pero publica ese `false` en
 * el `PresenceContext`, y Motion lo lee como
 * `blockInitialAnimation: presenceContext.initial === false` para TODO
 * descendiente (`framer-motion/.../use-visual-element.mjs`). Con eso, cada
 * `<Reveal>` de la primera pantalla de la sesión montaba directamente en su
 * estado visible: su `initial="hidden"` se descartaba y las apariciones por
 * scroll no ocurrían nunca.
 *
 * El síntoma es invisible en code review —no hay error, no hay warning, sólo
 * ausencia de animación— así que se fija con un test de comportamiento.
 */

const source = readFileSync(resolve(process.cwd(), 'src/motion/RouteTransition.tsx'), 'utf8')

beforeAll(() => {
  // jsdom no trae IntersectionObserver y `whileInView` lo necesita para
  // montar. No se simula ninguna intersección: lo que se afirma acá es el
  // estado de montaje, que es anterior a cualquier scroll.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(cleanup)

describe('RouteTransition no puede bloquear el initial de sus descendientes', () => {
  it('monta un Reveal hijo en su estado oculto', () => {
    const { container } = render(
      <MotionProvider>
        <RouteTransition viewKey="members">
          <Reveal className="sujeto">
            <p>contenido</p>
          </Reveal>
        </RouteTransition>
      </MotionProvider>,
    )

    const subject = container.querySelector('.sujeto')
    expect(subject).toBeTruthy()
    // Si esto falla con `opacity: 1` (o sin estilo), alguien volvió a poner
    // `initial={false}` en el AnimatePresence y todas las apariciones por
    // scroll del sitio quedaron muertas otra vez.
    expect(subject.getAttribute('style') ?? '').toContain('opacity: 0')
  })

  it('conserva la intención original: la página no se anima en la primera carga', () => {
    // La intención vive ahora en el `m.div`, donde `initial={false}` significa
    // "montá en el estado final sin animar" y no crea contexto de presencia.
    expect(source).toContain('isFirstRender.current ? false : initial')
    expect(source).not.toContain('<AnimatePresence mode="wait" initial={false}>')
  })
})
