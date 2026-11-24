import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findMorphSource, isRouteMorphing, morphNavigate } from '../src/motion/routeMorph.ts'

/**
 * Morph de ruta (src/motion/routeMorph.ts). jsdom no tiene View Transition
 * API ni layout, así que se simulan las dos cosas: `startViewTransition`
 * corre el callback y expone `finished`, y cada elemento declara su tamaño.
 */

function sized(element, width, height) {
  element.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height })
  return element
}

function page(id, headingText, { visible = true } = {}) {
  const container = document.createElement('div')
  container.className = 'page-transition'
  container.id = id
  const heading = sized(document.createElement('h1'), visible ? 240 : 1, visible ? 40 : 1)
  heading.textContent = headingText
  container.append(heading)
  return container
}

let finishTransition
let transitionNames

function installViewTransitions() {
  transitionNames = []
  document.startViewTransition = vi.fn((update) => {
    let resolveFinished
    const finished = new Promise((resolve) => {
      resolveFinished = resolve
    })
    const done = Promise.resolve().then(() => update())
    finishTransition = async () => {
      await done
      // Lo que el navegador vería como par en la captura nueva.
      transitionNames = [...document.querySelectorAll('*')]
        .filter((element) => element.style.viewTransitionName)
        .map((element) => element.textContent)
      resolveFinished()
      await finished
      await Promise.resolve()
    }
    return { finished, ready: done }
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-motion-tier')
  window.matchMedia = vi.fn(() => ({ matches: false }))
  installViewTransitions()
})

afterEach(() => {
  delete document.startViewTransition
  vi.useRealTimers()
})

describe('findMorphSource', () => {
  it('devuelve el título visible y descarta el visually-hidden de las fichas de marca', () => {
    const card = document.createElement('article')
    const hidden = sized(document.createElement('h3'), 1, 1)
    hidden.className = 'event-card__title'
    card.append(hidden)
    expect(findMorphSource(card, '.event-card__title')).toBeNull()

    const visible = sized(document.createElement('h3'), 120, 20)
    visible.className = 'event-card__title'
    card.append(visible)
    expect(findMorphSource(card, '.event-card__title')).toBe(visible)
  })
})

describe('morphNavigate', () => {
  it('sin View Transition API navega directo', () => {
    delete document.startViewTransition
    const navigate = vi.fn()
    morphNavigate(sized(document.createElement('span'), 100, 20), navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(isRouteMorphing()).toBe(false)
  })

  it('con movimiento reducido o tier "low" navega directo', () => {
    const navigate = vi.fn()
    window.matchMedia = vi.fn(() => ({ matches: true }))
    morphNavigate(sized(document.createElement('span'), 100, 20), navigate)
    window.matchMedia = vi.fn(() => ({ matches: false }))
    document.documentElement.setAttribute('data-motion-tier', 'low')
    morphNavigate(sized(document.createElement('span'), 100, 20), navigate)
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(document.startViewTransition).not.toHaveBeenCalled()
  })

  it('el título de la tarjeta pasa al h1 de la página nueva y la saliente se oculta', async () => {
    const oldPage = page('home', 'Powerlifting United Argentina')
    const source = sized(document.createElement('span'), 120, 20)
    source.textContent = 'Winter Open'
    oldPage.append(source)
    document.body.append(oldPage)

    const navigate = vi.fn(() => {
      // Vista distinta: Motion monta la nueva junto a la saliente.
      document.body.append(page('landing', 'Winter Open'))
    })
    morphNavigate(source, navigate)
    expect(source.style.viewTransitionName).toBe('route-morph-title')
    expect(isRouteMorphing()).toBe(true)

    await finishTransition()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(transitionNames).toEqual(['Winter Open'])
    // Al terminar no queda nada marcado: ni nombres ni el atributo.
    expect(document.querySelector('#landing h1').style.viewTransitionName).toBe('')
    expect(source.style.viewTransitionName).toBe('')
    expect(isRouteMorphing()).toBe(false)
    // La saliente sigue oculta mientras Motion corre su salida…
    expect(oldPage.style.display).toBe('none')
    // …y si pasado ese margen sigue montada (se reusó), vuelve a verse.
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(oldPage.style.display).toBe('')
  })

  it('misma vista (Calendario → landing): el contenedor es el mismo y no se oculta', async () => {
    const container = page('events', 'Calendario oficial')
    const source = sized(document.createElement('h3'), 120, 20)
    source.textContent = 'Winter Open'
    container.append(source)
    document.body.append(container)

    morphNavigate(source, () => {
      container.innerHTML = ''
      const heading = sized(document.createElement('h1'), 240, 40)
      heading.textContent = 'Winter Open'
      container.append(heading)
    })
    await finishTransition()

    expect(transitionNames).toEqual(['Winter Open'])
    expect(container.style.display).toBe('')
  })

  it('un h1 dentro de data-skip-route-morph no recibe nombre de transición', async () => {
    const oldPage = page('home', 'Calendario')
    const source = sized(document.createElement('span'), 120, 20)
    source.textContent = 'Barbell Submission'
    oldPage.append(source)
    document.body.append(oldPage)

    const started = performance.now()
    morphNavigate(source, () => {
      const landing = page('landing', 'Barbell Submission')
      const main = document.createElement('main')
      main.setAttribute('data-skip-route-morph', '')
      const heading = landing.querySelector('h1')
      main.append(heading)
      landing.append(main)
      document.body.append(landing)
    })
    await finishTransition()

    expect(performance.now() - started).toBeLessThan(200)
    expect(transitionNames).toEqual([])
    expect(document.querySelector('#landing h1').style.viewTransitionName).toBe('')
    expect(oldPage.style.display).toBe('none')
    expect(isRouteMorphing()).toBe(false)
  })

  it('si la página nueva no muestra un h1 a tiempo, termina sin par y sin ocultar nada', async () => {
    vi.useFakeTimers()
    const oldPage = page('home', 'Inicio')
    const source = sized(document.createElement('span'), 120, 20)
    oldPage.append(source)
    document.body.append(oldPage)

    morphNavigate(source, () => document.body.append(page('landing', 'Winter Open', { visible: false })))
    const finishing = finishTransition()
    await vi.advanceTimersByTimeAsync(1000)
    await finishing

    expect(transitionNames).toEqual([])
    expect(oldPage.style.display).toBe('')
    expect(isRouteMorphing()).toBe(false)
  })
})
