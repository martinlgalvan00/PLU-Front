/**
 * Grupo de botones de una sola selección (`aria-pressed`): "versión" y "tamaño"
 * de pantalla del visor de la landing.
 *
 * @param {{ label: string, options: [string, string][], value: string, onChange: (id: string) => void }} props
 */
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div className="admin-landing-preview__modes" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          className={value === id ? 'is-active' : ''}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
