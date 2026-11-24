import { Check, Upload } from 'lucide-react'

/**
 * Input de archivo compartido: staff (drop) y legajo de afiliación (acción).
 * La compresión y el signed upload viven en el caller.
 */
export default function FileUploadField({
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  busy = false,
  chooseLabel = 'Elegir archivo',
  done = false,
  doneLabel = 'Archivo cargado',
  error,
  hint,
  id,
  label,
  onFile,
  uploadingLabel = 'Subiendo…',
  variant = 'drop',
}) {
  const inputId =
    id ?? (label ? `file-upload-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined)

  function handleChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFile?.(file)
  }

  const icon = done ? (
    <Check size={variant === 'action' ? 14 : 16} aria-hidden />
  ) : busy ? (
    <span className="plu-spinner" aria-hidden />
  ) : (
    <Upload size={variant === 'action' ? 14 : 16} aria-hidden />
  )
  const statusLabel = done ? doneLabel : busy ? uploadingLabel : chooseLabel

  if (variant === 'action') {
    return (
      <label className={`account-documents__action${busy ? ' is-busy' : ''}`} htmlFor={inputId}>
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={handleChange}
        />
        {icon}
        <span>{statusLabel}</span>
        {error ? (
          <span className="account-documents__error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
    )
  }

  return (
    <label className="staff-application__file" htmlFor={inputId}>
      {label ? <span className="field__label">{label}</span> : null}
      <span className={`staff-application__file-drop${busy ? ' is-busy' : ''}`}>
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={handleChange}
        />
        {icon}
        <span>{statusLabel}</span>
      </span>
      {hint ? <small>{hint}</small> : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  )
}
