import '../../styles/components/confirmation-seal.css'
import { useEffect } from 'react'
import { celebrateHaptic } from '../../lib/haptics.js'

/**
 * ConfirmationSeal — PLU ARG
 *
 * El acuse de los tres momentos en que alguien pasa a formar parte de la
 * federación: se afilia, se inscribe a un meet, o su pago queda acreditado.
 * Antes los tres terminaban en una línea de texto y una pastilla de estado —
 * correcto, verificable y completamente frío. Alguien que acaba de pagar su
 * primera afiliación merece que la pantalla lo registre como un hecho, no
 * como un renglón de sistema.
 *
 * El festejo es un sello que se estampa: el anillo se traza, el check se
 * dibuja, el texto entra atrás. Es una sola secuencia one-shot de ~900 ms que
 * no se repite ni deja nada girando. Sin confeti, sin partículas, sin loops
 * — la marca es una federación deportiva, y la emoción acá viene de que el
 * trámite está cerrado y el nombre propio aparece confirmado.
 *
 * Accesibilidad: el bloque es `role="status"` con `aria-live="polite"`, así
 * que un lector de pantalla anuncia el resultado sin que nada dependa del
 * dibujo. Bajo `prefers-reduced-motion` no hay trazo ni entrada: el sello
 * aparece completo (ver confirmation-seal.css) y tampoco vibra el teléfono.
 *
 * @param {object} props
 * @param {'membership'|'registration'|'payment'} [props.variant]
 *   Solo cambia el tono del acento y la escala del sello — el gesto es el
 *   mismo en los tres, a propósito: es la misma federación confirmando.
 * @param {string} [props.eyebrow]  Qué quedó confirmado ("Afiliación acreditada").
 * @param {string} props.title      El hecho, en primera persona ("Sos socio PLU").
 * @param {string} [props.detail]   Línea de apoyo (vigencia, evento, monto).
 * @param {string} [props.seal]     Chip corto del sello ("Temporada 2026").
 * @param {boolean} [props.haptic]  Vibración de acuse en mobile. Solo para
 *   confirmaciones definitivas: nunca para un estado pendiente.
 */
export default function ConfirmationSeal({
  variant = 'membership',
  eyebrow,
  title,
  detail,
  seal,
  haptic = true,
  className = '',
}) {
  useEffect(() => {
    if (!haptic) return
    celebrateHaptic()
  }, [haptic])

  return (
    <div
      className={`confirmation-seal confirmation-seal--${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="confirmation-seal__mark" aria-hidden="true">
        <svg className="confirmation-seal__glyph" viewBox="0 0 48 48" focusable="false">
          <circle className="confirmation-seal__ring" cx="24" cy="24" r="21" />
          <path className="confirmation-seal__check" d="M14.5 24.6 L21 31 L33.5 17.8" />
        </svg>
      </span>

      <div className="confirmation-seal__copy">
        {eyebrow || seal ? (
          <p className="confirmation-seal__eyebrow">
            {eyebrow ? <span>{eyebrow}</span> : null}
            {seal ? <span className="confirmation-seal__stamp">{seal}</span> : null}
          </p>
        ) : null}
        <p className="confirmation-seal__title">{title}</p>
        {detail ? <p className="confirmation-seal__detail">{detail}</p> : null}
      </div>
    </div>
  )
}
