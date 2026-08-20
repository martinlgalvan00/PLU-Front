/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { applyAssist, getStoredAssist, initAssist, persistAssist } from '../lib/assistMode.js'

const AssistContext = createContext(null)

// Igual que el tema: el atributo se pone al evaluar el módulo, antes del
// primer render, para que no haya un salto de escala en pantalla.
const initialAssist = typeof document === 'undefined' ? false : initAssist()

export function AssistProvider({ children }) {
  const [assist, setAssistState] = useState(initialAssist)

  useEffect(() => {
    applyAssist(assist)
  }, [assist])

  const setAssist = useCallback((next) => {
    const enabled = Boolean(next)
    persistAssist(enabled)
    setAssistState(enabled)
  }, [])

  const toggleAssist = useCallback(() => {
    setAssistState((current) => {
      persistAssist(!current)
      return !current
    })
  }, [])

  const value = useMemo(
    () => ({ assist, setAssist, toggleAssist }),
    [assist, setAssist, toggleAssist],
  )

  return <AssistContext.Provider value={value}>{children}</AssistContext.Provider>
}

// Fallback estable para piezas que se renderizan sueltas (Storybook, tests de
// un solo componente) sin el provider real que sólo monta `AppProviders`.
const NOOP_ASSIST_CONTEXT = Object.freeze({
  assist: false,
  setAssist: () => {},
  toggleAssist: () => {},
})

export function useAssist() {
  return useContext(AssistContext) ?? NOOP_ASSIST_CONTEXT
}

export { getStoredAssist }
