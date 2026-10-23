import { useEffect } from 'react'

/**
 * Entrada de los bloques de una landing al llegar a la pantalla.
 *
 * Marca `data-reveal="hidden"` solo en los bloques que están debajo del primer
 * pantallazo y los pasa a `shown` cuando entran (el CSS hace la transición). Lo
 * que ya se ve al cargar nunca se oculta, y sin `IntersectionObserver` o con
 * movimiento reducido no se toca nada: el contenido siempre queda visible.
 *
 * Usa el `window` del propio nodo, así también anda dentro del marco de la
 * vista previa del panel.
 *
 * @param {{ current: HTMLElement | null }} rootRef contenedor de la landing
 * @param {string} motion `none` | `soft` | `bold`
 * @param {unknown} watch cambia cuando cambian los bloques (re-observa)
 */
export default function useRevealOnScroll(rootRef, motion, watch) {
  useEffect(() => {
    const root = rootRef.current
    const view = root?.ownerDocument?.defaultView
    if (!root || !view || motion === 'none' || !view.IntersectionObserver) return undefined
    if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    const blocks = [...root.querySelectorAll('.lb-block')]
    const below = blocks.filter((el) => el.getBoundingClientRect().top > view.innerHeight * 0.92)
    for (const el of below) el.dataset.reveal = 'hidden'

    const observer = new view.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.dataset.reveal = 'shown'
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    for (const el of below) observer.observe(el)

    return () => {
      observer.disconnect()
      for (const el of blocks) delete el.dataset.reveal
    }
  }, [rootRef, motion, watch])
}
