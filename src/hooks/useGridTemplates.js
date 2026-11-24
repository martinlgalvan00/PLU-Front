import { useCallback, useEffect, useState } from 'react'
import {
  deleteGridTemplate,
  fetchGridTemplates,
  saveGridTemplate,
} from '../services/eventRegistrationApi.js'

/**
 * Plantillas de grilla de la organización. Se piden cuando el asistente se abre
 * (`enabled`), no con el tablero: la mayoría de las visitas a la Grilla no las
 * necesitan. Guardar y borrar devuelven la lista completa, así que el estado
 * local es siempre lo que dijo el servidor.
 */
export function useGridTemplates(eventSlug, { enabled = true } = {}) {
  const [templates, setTemplates] = useState([])
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled || !eventSlug) return undefined
    let active = true
    setStatus('loading')
    fetchGridTemplates(eventSlug)
      .then((next) => {
        if (!active) return
        setTemplates(next)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError?.message ?? null)
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [enabled, eventSlug])

  const run = useCallback(async (action, fallbackMessage) => {
    setBusy(true)
    setError(null)
    try {
      setTemplates(await action())
      setStatus('ready')
      return true
    } catch (actionError) {
      setError(actionError?.message ?? fallbackMessage)
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const save = useCallback(
    (name, config) =>
      run(() => saveGridTemplate(eventSlug, { name, config }), 'No se pudo guardar la plantilla.'),
    [eventSlug, run],
  )

  const remove = useCallback(
    (templateId) =>
      run(() => deleteGridTemplate(eventSlug, templateId), 'No se pudo borrar la plantilla.'),
    [eventSlug, run],
  )

  return { templates, status, busy, error, save, remove }
}
