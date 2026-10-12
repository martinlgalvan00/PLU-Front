import { useId } from 'react'

/**
 * Fila de preferencia: nombre a la izquierda y, a la derecha, un selector de
 * una opción entre pocas (idioma, tema, modo del recorrido).
 *
 * Es un radiogroup: la opción activa lleva `aria-checked` y el cambio se
 * aplica al instante. La opción activa va en tinta (no en color de marca),
 * así que sirve igual en el panel monocromo y en el área pública.
 *
 * `options`: [{ value, label }].
 */
export default function PreferenceChoice({ label, options, value, onChange }) {
  const labelId = useId()

  return (
    <div className="pref-choice">
      <span className="pref-choice__label" id={labelId}>
        {label}
      </span>
      <div className="pref-choice__options" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`pref-choice__option${active ? ' is-active' : ''}`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
