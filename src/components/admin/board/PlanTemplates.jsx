import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BUILT_IN_TEMPLATES } from '../../../lib/gridTemplates.js'

/**
 * PlanTemplates — PLU ARG
 *
 * Elegir una plantilla (predefinida o de la organización), guardar la
 * configuración actual como plantilla nueva o pisar una existente, y borrar las
 * propias. Elegir una aplica de inmediato: la propuesta de abajo se recalcula.
 *
 * Las predefinidas no se pueden borrar ni pisar; guardar con el nombre de una
 * propia la actualiza (el backend resuelve por nombre, sin distinguir mayúsculas).
 */
export default function PlanTemplates({
  busy,
  canSave,
  error,
  onApply,
  onDelete,
  onSave,
  status,
  t,
  templates,
}) {
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const selected = templates.find((template) => template.id === selectedId) ?? null
  const trimmed = name.trim()
  const overwrites = templates.some(
    (template) => template.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )

  function handleSelect(event) {
    const id = event.target.value
    setSelectedId(id)
    const template = [...BUILT_IN_TEMPLATES, ...templates].find((item) => item.id === id)
    if (template) onApply(template)
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!trimmed || busy) return
    if (await onSave(trimmed)) setName('')
  }

  return (
    <div className="admin-board__plan-templates">
      <label className="admin-board__plan-field admin-board__plan-field--grow">
        <span className="admin-board__plan-label">{t('admin.board.planTemplate')}</span>
        <select value={selectedId} onChange={handleSelect} disabled={busy}>
          <option value="">{t('admin.board.planTemplatePlaceholder')}</option>
          <optgroup label={t('admin.board.planTemplateBuiltIn')}>
            {BUILT_IN_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
          {templates.length > 0 ? (
            <optgroup label={t('admin.board.planTemplateSaved')}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      {canSave && selected ? (
        <button
          type="button"
          className="admin-board__icon-btn admin-board__icon-btn--visible"
          onClick={() => {
            onDelete(selected)
            setSelectedId('')
          }}
          disabled={busy}
          aria-label={t('admin.board.planTemplateDelete', { name: selected.name })}
          title={t('admin.board.planTemplateDelete', { name: selected.name })}
        >
          <Trash2 size={14} aria-hidden />
        </button>
      ) : null}

      {canSave ? (
        <form className="admin-board__plan-save" onSubmit={handleSave}>
          <label className="admin-board__plan-field">
            <span className="admin-board__plan-label">{t('admin.board.planTemplateName')}</span>
            <input
              type="text"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>
          <button type="submit" className="admin-board__text-btn" disabled={busy || !trimmed}>
            {overwrites
              ? t('admin.board.planTemplateOverwrite')
              : t('admin.board.planTemplateSave')}
          </button>
        </form>
      ) : null}

      {status === 'error' || error ? (
        <p className="admin-board__plan-warn" role="alert">
          {error ?? t('admin.board.planTemplateLoadError')}
        </p>
      ) : null}
    </div>
  )
}
