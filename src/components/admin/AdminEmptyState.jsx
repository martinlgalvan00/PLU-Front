import Button from '../ui/Button.jsx'

/**
 * Estado vacío que distingue "todavía no hay nada acá" de "tu filtro no
 * encontró nada" -- antes solo lo hacía Inscripciones (`admin-empty`,
 * `admin-empty--filtered`), y el resto de las secciones mostraba una frase
 * plana sin salida cuando el filtro dejaba la tabla en cero. Generalizado
 * acá para reusar el mismo patrón vía `emptyMessage` de `AdminDataTable`.
 *
 * `filtered = true` cambia el ícono a modo secundario y la acción a un link
 * de texto ("Limpiar filtros") en vez de un botón -- mismo criterio visual
 * que ya tenía Inscripciones.
 */
export default function AdminEmptyState({
  icon: Icon,
  title,
  lead,
  filtered = false,
  actionLabel,
  onAction,
}) {
  return (
    <div className={`admin-empty${filtered ? ' admin-empty--filtered' : ''}`}>
      {Icon ? (
        <span className="admin-empty__icon" aria-hidden>
          <Icon size={filtered ? 20 : 22} strokeWidth={1.6} />
        </span>
      ) : null}
      <h2 className="admin-empty__title">{title}</h2>
      {lead ? <p className="admin-empty__lead">{lead}</p> : null}
      {actionLabel && onAction ? (
        filtered ? (
          <button type="button" className="admin-empty__text-link" onClick={onAction}>
            {actionLabel}
          </button>
        ) : (
          <Button type="button" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      ) : null}
    </div>
  )
}
