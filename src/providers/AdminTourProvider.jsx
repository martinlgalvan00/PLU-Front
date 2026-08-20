/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AdminTourContext = createContext(null)

const SEEN_KEY_PREFIX = 'plu-admin-tour-seen:'
const MODE_KEY = 'plu-tour-mode'

/** 'once': se auto-abre la primera vez y no más (default). 'always': se
 * auto-abre cada vez que se entra a la sección, aunque ya se haya visto.
 * 'off': nunca se auto-abre -- solo queda disponible a demanda (botón de
 * ayuda). El modo es una preferencia del navegador, no del tour puntual. */
export const TOUR_MODES = ['once', 'always', 'off']
const DEFAULT_MODE = 'once'

function hasSeenTour(tourId) {
  try {
    return window.localStorage.getItem(`${SEEN_KEY_PREFIX}${tourId}`) === '1'
  } catch {
    // Sin localStorage no hay forma de recordar que ya se vio -- mejor no
    // insistir con el tour en cada render que arriesgar mostrarlo siempre.
    return true
  }
}

function markTourSeen(tourId) {
  try {
    window.localStorage.setItem(`${SEEN_KEY_PREFIX}${tourId}`, '1')
  } catch {
    // Almacenamiento no disponible (modo privado, cuota) -- el tour va a
    // reaparecer la próxima vez, no es crítico.
  }
}

function readTourMode() {
  try {
    const stored = window.localStorage.getItem(MODE_KEY)
    return TOUR_MODES.includes(stored) ? stored : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

function writeTourMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    // No persiste entre sesiones, pero no rompe la de ahora.
  }
}

/**
 * Motor de recorridos guiados de toda la app: un solo tour activo a la vez,
 * con pasos `{ target, placement, title, body, frame? }` (`target` es un
 * selector CSS resuelto por `AdminTourOverlay`). No depende de una sección en
 * particular -- cada pantalla arma sus propios pasos y los pasa a
 * `startTour`/`replayTour`.
 *
 * Dos modos, elegidos por el que arranca el tour:
 *
 * - `modal` (default): el resto de la pantalla no responde. Sirve para
 *   presentar una sección, que es lo que hace el panel admin.
 * - `coach`: el fondo se atenúa pero nada se bloquea, y no hay focus-trap ni
 *   scroll-lock. Es el tutorial campo por campo de los formularios públicos:
 *   la persona escribe en el campo señalado mientras la tarjeta le explica
 *   qué poner, y el paso espera a que su campo aparezca en pantalla en vez de
 *   saltearse (los campos de la segunda sección no existen hasta que avanza).
 */
export function AdminTourProvider({ children }) {
  const [activeTour, setActiveTour] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [tourMode, setTourModeState] = useState(readTourMode)

  const setTourMode = useCallback((mode) => {
    if (!TOUR_MODES.includes(mode)) return
    writeTourMode(mode)
    setTourModeState(mode)
    // Elegir "Nunca" también cancela el recorrido que está en pantalla: el
    // usuario está pidiendo dejar de verlo ahora, no recién la próxima vez.
    if (mode === 'off') {
      setActiveTour(null)
      setStepIndex(0)
    }
  }, [])

  const startTour = useCallback(
    (tourId, steps, { mode = 'modal' } = {}) => {
      if (!steps?.length || tourMode === 'off') return false
      if (tourMode === 'once' && hasSeenTour(tourId)) return false
      // Se marca "visto" apenas arranca, no solo al cerrarlo: si la sección
      // se desmonta o la página se recarga a mitad del tour (navegación
      // rápida entre secciones, hot-reload), antes el flag nunca se
      // persistía y el tour volvía a arrancar de cero en la próxima visita
      // -- de ahí la sensación de que se repite todo el tiempo.
      markTourSeen(tourId)
      setActiveTour({ id: tourId, steps, mode })
      setStepIndex(0)
      return true
    },
    [tourMode],
  )

  const replayTour = useCallback((tourId, steps, { mode = 'modal' } = {}) => {
    if (!steps?.length) return false
    setActiveTour({ id: tourId, steps, mode })
    setStepIndex(0)
    return true
  }, [])

  const closeTour = useCallback(() => {
    if (activeTour) markTourSeen(activeTour.id)
    setActiveTour(null)
    setStepIndex(0)
  }, [activeTour])

  const nextStep = useCallback(() => {
    if (!activeTour) return
    if (stepIndex + 1 >= activeTour.steps.length) {
      closeTour()
      return
    }
    setStepIndex(stepIndex + 1)
  }, [activeTour, stepIndex, closeTour])

  // Un paso puede quedar sin blanco (viewport angosto, sección no montada);
  // el overlay llama a `skipStep` en vez de trabarse mostrando una tarjeta
  // apuntando a nada.
  const skipStep = nextStep

  const prevStep = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const value = useMemo(
    () => ({
      activeTour,
      stepIndex,
      isLastStep: activeTour ? stepIndex >= activeTour.steps.length - 1 : false,
      tourMode,
      setTourMode,
      startTour,
      replayTour,
      closeTour,
      nextStep,
      prevStep,
      skipStep,
      hasSeenTour,
    }),
    [
      activeTour,
      stepIndex,
      tourMode,
      setTourMode,
      startTour,
      replayTour,
      closeTour,
      nextStep,
      prevStep,
      skipStep,
    ],
  )

  return <AdminTourContext.Provider value={value}>{children}</AdminTourContext.Provider>
}

// Fallback estable (misma referencia siempre) para secciones que se
// renderizan sueltas -- Storybook, tests unitarios de una sola sección --
// sin el `AdminTourProvider` real que solo monta `App`. El tour es una
// mejora opcional: ninguna pantalla debería depender de él para renderizar.
const NOOP_TOUR_CONTEXT = {
  activeTour: null,
  stepIndex: 0,
  isLastStep: false,
  tourMode: DEFAULT_MODE,
  setTourMode: () => {},
  startTour: () => false,
  replayTour: () => false,
  closeTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipStep: () => {},
  hasSeenTour,
}

export function useAdminTour() {
  const ctx = useContext(AdminTourContext)
  return ctx ?? NOOP_TOUR_CONTEXT
}
