import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Una sola lectura de puestos y personal para las dos piezas del protocolo
 * (zonas y equipo). Antes cada una pedía los mismos dos endpoints al abrir
 * la pestaña, y un alta volvía a pedirlos otra vez.
 */
export function useEventSecurityDirectory({
  eventId,
  onListSecurityUsers,
  onListZones,
  reloadToken = 0,
}) {
  const [users, setUsers] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const hasLoadedRef = useRef(false)
  const eventRef = useRef(eventId)

  if (eventRef.current !== eventId) {
    eventRef.current = eventId
    hasLoadedRef.current = false
  }

  const reload = useCallback(() => setReloadKey((current) => current + 1), [])

  useEffect(() => {
    if (!eventId || !onListSecurityUsers) return undefined
    let active = true

    if (!hasLoadedRef.current) setLoading(true)
    setError(null)
    const zonesPromise = onListZones
      ? onListZones(eventId).catch(() => [])
      : Promise.resolve([])

    Promise.all([onListSecurityUsers(eventId), zonesPromise])
      .then(([userRows, zoneRows]) => {
        if (!active) return
        setUsers(Array.isArray(userRows) ? userRows : [])
        setZones(Array.isArray(zoneRows) ? zoneRows : [])
      })
      .catch((loadError) => {
        if (active) setError(loadError)
      })
      .finally(() => {
        if (!active) return
        hasLoadedRef.current = true
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [eventId, onListSecurityUsers, onListZones, reloadKey, reloadToken])

  return { users, setUsers, zones, setZones, loading, error, reload }
}
