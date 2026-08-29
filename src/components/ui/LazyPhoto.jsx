import { useEffect, useRef, useState } from 'react'

/**
 * Solo activa la carga cuando el nodo entra (o está cerca) del viewport.
 * Evita N downloads a Storage al montar tablas del panel o listados públicos.
 */
export function useNearViewport(options = {}) {
  const { rootMargin = '120px', once = true, enabled = true } = options
  const ref = useRef(null)
  const [near, setNear] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setNear(true)
      return undefined
    }
    const node = ref.current
    if (!node || near) return undefined
    if (typeof IntersectionObserver !== 'function') {
      setNear(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setNear(true)
        if (once) observer.disconnect()
      },
      { rootMargin, threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, near, once, rootMargin])

  return { ref, near }
}

/**
 * Foto diferida: no pone `src` hasta estar cerca del viewport.
 * El contenedor con `ref` debe ser un elemento con caja (no `display: contents`).
 */
export function LazyPhoto({
  alt = '',
  className = '',
  enabled = true,
  rootMargin = '120px',
  src,
  ...imgProps
}) {
  const { ref, near } = useNearViewport({ rootMargin, enabled: Boolean(src) && enabled })
  if (!src) return null

  return (
    <span ref={ref} className="lazy-photo-slot" aria-hidden={alt ? undefined : true}>
      {near ? (
        <img
          className={className}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          {...imgProps}
        />
      ) : null}
    </span>
  )
}
