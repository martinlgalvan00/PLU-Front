import { BRAND } from '../../lib/brand.js'

/**
 * Emblema PLU como firma de las capas de vidrio (ver plu-glass.css).
 * Decorativo: el texto vecino ya nombra la federación, por eso `alt` vacío.
 * Sin i18n a propósito: los avisos globales deben poder montarse aislados.
 *
 * `children` se dibuja sobre el disco (p. ej. la insignia de estado).
 */
export default function PluGlassMark({ className = '', size = 36, children }) {
  return (
    <span className={`plu-glass-mark ${className}`.trim()} aria-hidden>
      <img src={BRAND.logoArgentinaDisplayUrl} alt="" width={size} height={size} decoding="async" />
      {children}
    </span>
  )
}
