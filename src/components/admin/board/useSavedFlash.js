import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Bandera que se prende un rato y se apaga sola: la confirmación "Guardado" que
 * acompaña a un guardado bueno. Volver a dispararla reinicia el rato; al
 * desmontar se cancela, así no queda un timer tocando un componente que ya no está.
 */
export function useSavedFlash(duration = 2200) {
  const [flash, setFlash] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const trigger = useCallback(() => {
    clearTimeout(timer.current)
    setFlash(true)
    timer.current = setTimeout(() => setFlash(false), duration)
  }, [duration])

  return [flash, trigger]
}
