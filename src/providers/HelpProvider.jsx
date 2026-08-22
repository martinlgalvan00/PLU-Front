/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const HelpContext = createContext(null)

/**
 * Estado de la ayuda guiada pública: abierta o cerrada, y desde dónde se
 * pidió. Vive en un provider y no en `App` porque la piden superficies que no
 * son hermanas del panel — la barra sticky de la portada, un CTA bloqueado, la
 * propia tecla de la ayuda — y encadenar `onOpenHelp` por props hasta cada una
 * obligaba a que toda pantalla intermedia la reenviara.
 *
 * `origin` sólo se usa para telemetría/depuración del panel; no cambia lo que
 * se muestra: el contenido lo decide el estado real del trámite
 * (`resolveAthleteJourney`), nunca el botón que lo abrió.
 */
export function HelpProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState(null)

  const openHelp = useCallback((nextOrigin = 'dock') => {
    setOrigin(nextOrigin)
    setOpen(true)
  }, [])

  const closeHelp = useCallback(() => {
    setOpen(false)
  }, [])

  const toggleHelp = useCallback((nextOrigin = 'dock') => {
    setOrigin(nextOrigin)
    setOpen((current) => !current)
  }, [])

  const value = useMemo(
    () => ({ open, origin, openHelp, closeHelp, toggleHelp }),
    [open, origin, openHelp, closeHelp, toggleHelp],
  )

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

// Fallback estable para componentes que se renderizan sueltos (Storybook,
// tests de una sola pieza) sin el provider real que sólo monta `AppProviders`.
// La ayuda es una mejora opcional: ninguna pantalla debería depender de ella
// para renderizar.
const NOOP_HELP_CONTEXT = Object.freeze({
  open: false,
  origin: null,
  openHelp: () => {},
  closeHelp: () => {},
  toggleHelp: () => {},
})

export function useHelp() {
  return useContext(HelpContext) ?? NOOP_HELP_CONTEXT
}
