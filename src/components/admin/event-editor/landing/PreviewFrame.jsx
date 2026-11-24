import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { mirrorDocumentStyles } from '../../../../lib/mirrorDocumentStyles.js'

/** Atributos del `<html>` del panel que cambian cómo se ve el CSS público. */
const MIRRORED_ROOT_ATTRIBUTES = ['data-theme', 'lang']

/**
 * Iframe sin URL que renderiza a sus hijos con React (portal). Al ser un
 * documento propio, el CSS responde al ancho del marco —la vista móvil es
 * real— y los estilos públicos no se mezclan con los del panel.
 *
 * No se carga ninguna página en el iframe: por eso no depende de las cabeceras
 * `frame-ancestors` / `X-Frame-Options` del sitio. Los estilos se copian del
 * documento principal (`mirrorDocumentStyles`).
 *
 * Limitación: las medidas que lee JavaScript (`window.innerWidth`,
 * `matchMedia`) siguen siendo las de la ventana del panel; solo el CSS cambia
 * con el ancho del marco.
 */
export default function PreviewFrame({
  title,
  width = null,
  style = null,
  className = '',
  onEscape,
  onDocument,
  children,
}) {
  const frameRef = useRef(null)
  // Objeto estable que se muta (no se reasigna): el cleanup del efecto lo lee al desmontar.
  const stateRef = useRef({ doc: null, dispose: null })
  const onEscapeRef = useRef(onEscape)
  const onDocumentRef = useRef(onDocument)
  const [mountNode, setMountNode] = useState(null)

  useEffect(() => {
    onEscapeRef.current = onEscape
    onDocumentRef.current = onDocument
  }, [onEscape, onDocument])

  const attach = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    const state = stateRef.current
    if (!doc?.body || state.doc === doc) return

    state.dispose?.()
    for (const name of MIRRORED_ROOT_ATTRIBUTES) {
      const value = document.documentElement.getAttribute(name)
      if (value) doc.documentElement.setAttribute(name, value)
    }
    doc.body.style.margin = '0'
    // Las reglas del tema cuelgan de `.app-shell`, igual que en el sitio.
    const shell = doc.createElement('div')
    shell.className = 'app-shell'
    doc.body.replaceChildren(shell)

    const stopMirroring = mirrorDocumentStyles(document, doc)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onEscapeRef.current?.()
    }
    doc.addEventListener('keydown', onKeyDown)

    state.doc = doc
    state.dispose = () => {
      stopMirroring()
      doc.removeEventListener('keydown', onKeyDown)
    }
    setMountNode(shell)
    // El editor visual necesita el documento para desplazar la vista previa
    // hasta el bloque elegido en el panel.
    onDocumentRef.current?.(doc)
  }, [])

  // Chrome entrega el documento inicial ya listo; Firefox lo reemplaza tras `load`.
  useLayoutEffect(() => {
    attach()
  }, [attach])

  useEffect(() => {
    const state = stateRef.current
    return () => state.dispose?.()
  }, [])

  return (
    <>
      <iframe
        ref={frameRef}
        className={`admin-landing-preview__frame ${className}`.trim()}
        style={style ?? (width ? { width } : undefined)}
        title={title}
        onLoad={attach}
      />
      {mountNode ? createPortal(children, mountNode) : null}
    </>
  )
}
