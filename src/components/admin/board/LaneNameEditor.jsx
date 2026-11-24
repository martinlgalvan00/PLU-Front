import { useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import SavedMark from './SavedMark.jsx'
import { useSavedFlash } from './useSavedFlash.js'

/**
 * LaneNameEditor — PLU ARG
 *
 * Nombre del tablado en la cabecera de su columna, editable en el lugar: es
 * donde el operador lo está mirando cuando se da cuenta de que "Tablado 2" no
 * dice nada. Enter guarda, Escape descarta. El nombre es del evento, no del
 * día: al guardar cambia en todas las columnas y en el sitio público.
 *
 * Guardar muestra el progreso en el botón (el giro es un estado real, no
 * decoración) y, si salió bien, un check que se desvanece junto al nombre.
 *
 * Sin permiso de estructura es un título común, sin lápiz.
 */
export default function LaneNameEditor({
  busy = false,
  canEdit = false,
  name,
  onRename,
  siblings = [],
  t,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [saved, flashSaved] = useSavedFlash()

  const trimmed = draft.trim()
  const taken = siblings.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())
  const invalid = !trimmed || taken

  if (!canEdit) return <h3 className="admin-board__lane-name">{name}</h3>

  if (!editing) {
    return (
      <div className="admin-board__lane-title">
        <h3 className="admin-board__lane-name">{name}</h3>
        {saved ? <SavedMark iconOnly label={t('admin.board.platformRenameSaved')} /> : null}
        <button
          type="button"
          className="admin-board__lane-edit"
          onClick={() => {
            setDraft(name)
            setEditing(true)
          }}
          disabled={busy}
          aria-label={t('admin.board.platformRename', { name })}
        >
          <Pencil size={13} aria-hidden />
        </button>
      </div>
    )
  }

  function cancel() {
    setEditing(false)
    setDraft(name)
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || invalid) return
    if (trimmed === name) {
      cancel()
      return
    }
    setSaving(true)
    const ok = await onRename(trimmed)
    setSaving(false)
    if (ok) {
      setEditing(false)
      flashSaved()
    }
  }

  return (
    <form className="admin-board__lane-rename" onSubmit={submit}>
      <input
        type="text"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- el foco sigue al lápiz que se acaba de apretar
        autoFocus
        maxLength={80}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Sin esto el Escape cerraría también el diálogo o el panel de arriba.
            event.stopPropagation()
            cancel()
          }
        }}
        disabled={busy}
        aria-label={t('admin.board.platformRenameField')}
        aria-invalid={invalid || undefined}
      />
      <button
        type="submit"
        className="admin-board__lane-edit"
        disabled={busy || invalid}
        aria-busy={saving || undefined}
        aria-label={
          saving ? t('admin.board.platformRenameSaving') : t('admin.board.platformRenameSave')
        }
      >
        {saving ? (
          <Loader2 className="admin-board__spin" size={14} aria-hidden />
        ) : (
          <Check size={14} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="admin-board__lane-edit"
        onClick={cancel}
        disabled={busy}
        aria-label={t('admin.board.platformRenameCancel')}
      >
        <X size={14} aria-hidden />
      </button>
      {taken ? (
        <span className="admin-board__lane-rename-error" role="status">
          {t('admin.board.platformRenameTaken')}
        </span>
      ) : null}
    </form>
  )
}
