import { Check } from 'lucide-react'

/**
 * SavedMark — PLU ARG
 *
 * Confirmación breve de un guardado: un check que entra y se desvanece. Habla
 * como estado (`role="status"`) y dice "Guardado" con texto, no solo con el
 * ícono; `iconOnly` oculta el texto a la vista pero lo deja para lectores de
 * pantalla (en el título de una columna no hay lugar para una palabra).
 *
 * El fade-out lo hace la CSS; quien lo monta lo desmonta con `useSavedFlash`,
 * con una duración que casa con `--saved-duration`.
 */
export default function SavedMark({ iconOnly = false, label }) {
  return (
    <span className="admin-board__saved" role="status">
      <Check size={13} strokeWidth={2.5} aria-hidden />
      <span className={iconOnly ? 'visually-hidden' : undefined}>{label}</span>
    </span>
  )
}
