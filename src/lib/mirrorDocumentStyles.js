/**
 * Replica en otro documento (p. ej. un iframe) las hojas de estilo del documento
 * principal y las mantiene al día: Vite inyecta el CSS de cada chunk perezoso en
 * `<head>` cuando se carga, y el HMR reescribe el texto de los `<style>`.
 *
 * Sirve para renderizar la vista previa de una landing dentro de un iframe sin
 * servidor: las media queries responden al ancho del iframe (vista móvil real)
 * y el CSS público queda aislado del panel.
 *
 * @param {Document} source documento del que se copian los estilos
 * @param {Document} target documento que los recibe
 * @returns {() => void} desconecta el observador y quita lo copiado
 */

const STYLE_SELECTOR = 'style, link[rel="stylesheet"]'

export function mirrorDocumentStyles(source, target) {
  /** @type {Map<Element, Element>} original → copia */
  const clones = new Map()

  const isStyleNode = (node) => node.nodeType === 1 && node.matches(STYLE_SELECTOR)

  function add(node) {
    if (!isStyleNode(node) || clones.has(node)) return
    const clone = node.cloneNode(true)
    clones.set(node, clone)
    target.head.appendChild(clone)
  }

  function remove(node) {
    clones.get(node)?.remove()
    clones.delete(node)
  }

  source.head.querySelectorAll(STYLE_SELECTOR).forEach(add)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(add)
      record.removedNodes.forEach(remove)
      // El HMR cambia el contenido de un <style> existente: se copia el texto nuevo.
      const clone = clones.get(record.target)
      if (clone && record.target.tagName === 'STYLE') clone.textContent = record.target.textContent
    }
  })
  observer.observe(source.head, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    clones.forEach((clone) => clone.remove())
    clones.clear()
  }
}
