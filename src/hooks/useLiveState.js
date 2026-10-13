import { useCallback, useRef, useState } from 'react'

/**
 * Estado con una referencia que se actualiza en el mismo instante del `set`,
 * sin esperar al próximo render.
 *
 * Sirve cuando un handler encadena dos escrituras que dependen una de otra
 * (guardar el estado del evento y después el evento entero): la segunda corre
 * con el callback del render anterior, y si lee el estado de su cierre trabaja
 * con la lista previa a la primera. `ref.current` es siempre la última.
 *
 * Acepta valor o función `(actual) => siguiente`, como `useState`.
 */
export default function useLiveState(initial) {
  const [state, setState] = useState(initial)
  const ref = useRef(state)
  const set = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(ref.current) : next
    ref.current = resolved
    setState(resolved)
  }, [])
  return [state, set, ref]
}
