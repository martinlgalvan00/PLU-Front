import { ChevronDown, Eye } from 'lucide-react'

export function CapacityVisibilityToggle({
  canEdit,
  checked,
  hint,
  id,
  nested = false,
  onChange,
  t,
  title,
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      className={`admin-event-form__toggle${nested ? ' admin-event-form__toggle--nested' : ''}${checked ? ' is-on' : ''}${canEdit ? '' : ' is-disabled'}`}
      disabled={!canEdit}
      onClick={() => onChange(!checked)}
    >
      <span className="admin-event-form__toggle-ui" aria-hidden />
      <span className="admin-event-form__toggle-copy">
        <strong>
          {nested ? null : <Eye size={13} aria-hidden />}
          {title ?? t('admin.eventEditor.capacityVisibilityTitle')}
        </strong>
        <small>{hint ?? t('admin.eventEditor.capacityVisibilityHint')}</small>
      </span>
    </button>
  )
}

export function CapacityPublicBreakdown({
  canEdit,
  preview,
  progressChecked,
  progressId,
  t,
  totalChecked,
  totalId,
  onProgressChange,
  onTotalChange,
}) {
  return (
    <div className="admin-event-form__cupo-public">
      <CapacityVisibilityToggle
        canEdit={canEdit}
        checked={progressChecked}
        id={progressId}
        t={t}
        onChange={onProgressChange}
      />
      <CapacityVisibilityToggle
        canEdit={canEdit}
        checked={totalChecked}
        hint={t('admin.eventEditor.capacityTotalVisibilityHint')}
        id={totalId}
        nested
        t={t}
        title={t('admin.eventEditor.capacityTotalVisibilityTitle')}
        onChange={onTotalChange}
      />
      {preview ? (
        <p className="admin-event-form__cupo-preview" aria-live="polite">
          {preview}
        </p>
      ) : null}
    </div>
  )
}

export function FormField({ children, error, htmlFor, label, wide = false }) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <label
      className={`admin-event-form__field${wide ? ' admin-event-form__field--wide' : ''}${error ? ' is-invalid' : ''}`}
      htmlFor={htmlFor}
    >
      <span>{label}</span>
      {children}
      {error ? (
        <span className="admin-event-form__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  )
}

/**
 * Lo que casi nunca se toca al cargar un meet (textos de la página pública,
 * módulos visibles, transmisión) queda detrás de un solo desplegable. Con
 * `enabled` apagado -- el acordeón de la consola -- se renderiza plano, como
 * antes.
 */
export function AdvancedGroup({ children, enabled, onToggle, open, summary }) {
  if (!enabled) return children
  return (
    <details
      className="admin-event-form__advanced"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary>
        <span>{summary}</span>
        <ChevronDown size={14} aria-hidden />
      </summary>
      <div className="admin-event-form__advanced-body">{children}</div>
    </details>
  )
}
