import { useEventSecurityDirectory } from '../../hooks/useEventSecurityDirectory.js'

/**
 * Monta la lectura compartida solo cuando la pestaña de seguridad está en
 * el árbol. El padre pasa el directorio a zonas y al equipo.
 */
export default function AdminEventSecurityBoard({
  children,
  eventId,
  onListSecurityUsers,
  onListZones,
  reloadToken = 0,
}) {
  const directory = useEventSecurityDirectory({
    eventId,
    onListSecurityUsers,
    onListZones,
    reloadToken,
  })

  return children(directory)
}
