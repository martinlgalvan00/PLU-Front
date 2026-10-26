/**
 * Morph de ruta: el título de la tarjeta que se tocó se transforma en el
 * título (`h1`) de la página que abre — la ficha de un evento crece hasta ser
 * su landing. Es continuidad de lugar: se ve de dónde salió la pantalla nueva.
 *
 * Usa la View Transition API y no Motion porque las dos pantallas nunca están
 * montadas a la vez (`RouteTransition` usa `AnimatePresence mode="wait"` y las
 * landings son lazy). Es genérico a propósito: el destino es el primer `h1`
 * de la página nueva, sea cual sea la plantilla (Constructor, editorial,
 * submission, en construcción), así que ninguna plantilla tiene que cablearlo.
 *
 * Sin soporte, con movimiento reducido o en tier 'low' se navega igual que
 * siempre. Si el destino no aparece a tiempo, la transición termina como un
 * fundido simple de pantalla completa.
 */

const MORPH_ATTR = 'data-route-morph'
const MORPH_NAME = 'route-morph-title'

/** Tope de espera por la página nueva (chunk lazy + datos ya en memoria). El
 * navegador congela la pantalla mientras tanto; más de esto se nota. */
const TARGET_WAIT_MS = 900

/** Margen para que Motion termine la salida de la página oculta y la desmonte. */
const HIDDEN_PAGE_RESTORE_MS = 600

function canMorph(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof document.startViewTransition !== 'function') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return document.documentElement.getAttribute('data-motion-tier') !== 'low'
}

/** `RouteTransition` lo consulta para montar la página nueva sin su propia
 * entrada: el morph ya es la transición, y la captura nueva tiene que ver la
 * página entera, no un cuadro en opacity 0. */
export function isRouteMorphing(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(MORPH_ATTR)
}

/** Con `setTimeout` y no `requestAnimationFrame`: mientras la View Transition
 * espera el DOM nuevo el navegador no pinta y rAF no corre — la espera no
 * avanzaba nunca y la transición se cortaba por timeout a los 4s. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 16))
}

/** Texto con tamaño real: deja afuera los `visually-hidden` (1px) que usan las
 * fichas de marca, donde lo visible es un logo y no hay título que viaje. */
function isVisibleText(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width >= 24 && rect.height >= 12
}

/**
 * Título visible dentro de la tarjeta tocada, o `null` si la tarjeta no lo
 * muestra (entonces la navegación es un fundido simple).
 */
export function findMorphSource(
  container: Element | null | undefined,
  selector: string,
): HTMLElement | null {
  if (!container) return null
  for (const element of container.querySelectorAll<HTMLElement>(selector)) {
    if (isVisibleText(element)) return element
  }
  return null
}

function pageHeadings(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.page-transition h1')]
}

/**
 * Primer `h1` visible que no estaba antes de navegar. Se compara por nodo y no
 * por contenedor: dos vistas pueden compartir el mismo `.page-transition`
 * (Calendario y la landing de un evento son la vista `events`) y la saliente
 * puede seguir montada mientras corre su salida.
 */
async function waitForTarget(before: Set<HTMLElement>): Promise<HTMLElement | null> {
  const deadline = performance.now() + TARGET_WAIT_MS
  while (performance.now() < deadline) {
    for (const heading of pageHeadings()) {
      if (!before.has(heading) && isVisibleText(heading)) return heading
    }
    await nextTick()
  }
  return null
}

/**
 * @param source título visible de la tarjeta tocada
 * @param navigate la navegación de siempre (puede ser async)
 */
export function morphNavigate(
  source: HTMLElement | null | undefined,
  navigate: () => unknown,
): void {
  if (!source || !canMorph()) {
    navigate()
    return
  }

  const root = document.documentElement
  const oldPage = source.closest('.page-transition')
  const headingsBefore = new Set(pageHeadings())
  let target: HTMLElement | null = null
  let hiddenPage: HTMLElement | null = null

  source.style.viewTransitionName = MORPH_NAME
  root.setAttribute(MORPH_ATTR, '')

  const transition = document.startViewTransition(async () => {
    // La captura vieja ya se tomó: el nombre pasa al destino.
    source.style.viewTransitionName = ''
    await navigate()
    target = await waitForTarget(headingsBefore)
    if (target) target.style.viewTransitionName = MORPH_NAME
    // `RouteTransition` monta la página nueva junto a la saliente durante el
    // morph (sin rAF, la salida animada de Motion no termina hasta que la
    // transición suelta el pintado). La saliente ya está en la captura vieja:
    // se oculta para que no aparezca apilada en la nueva, y Motion la
    // desmonta al terminar su salida. Si la nueva vive en el mismo contenedor
    // (misma vista), no hay nada que ocultar.
    const newPage = target?.closest('.page-transition')
    if (
      newPage &&
      oldPage instanceof HTMLElement &&
      oldPage !== newPage &&
      oldPage.isConnected
    ) {
      hiddenPage = oldPage
      hiddenPage.style.display = 'none'
    }
  })

  transition.finished
    .catch(() => {})
    .finally(() => {
      root.removeAttribute(MORPH_ATTR)
      source.style.viewTransitionName = ''
      if (target) target.style.viewTransitionName = ''
      // La salida de Motion (160ms) recién corre cuando la transición suelta
      // el pintado: restaurarla acá la haría reaparecer apilada. Si pasado ese
      // margen sigue montada es porque se reusó (volver enseguida a la misma
      // vista) y tiene que verse.
      if (hiddenPage) {
        const page = hiddenPage
        window.setTimeout(() => {
          if (page.isConnected) page.style.display = ''
        }, HIDDEN_PAGE_RESTORE_MS)
      }
    })
}
