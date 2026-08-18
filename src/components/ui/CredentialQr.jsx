import '../../styles/components/credential-qr.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QrCode } from 'lucide-react'

/**
 * CredentialQr — PLU ARG
 *
 * Superficie única del código QR de la credencial. Antes cada pantalla
 * resolvía el suyo: `qrSrc ? <img> : <icono>`, sin estado intermedio. El QR se
 * genera con un import dinámico (`generateCredentialQr`), así que en mobile
 * había entre 200 y 900 ms en los que la credencial mostraba un ícono de
 * placeholder y después el código aparecía de golpe, sin relación con lo que
 * había antes.
 *
 * Acá el hueco tiene forma: mientras se genera, la trama del código se dibuja
 * como placa vacía —comunica "esto se está imprimiendo", no "esto falló"— y
 * cuando llega la imagen se revela una sola vez con un settle y un barrido de
 * laminado. Es la única animación de la pieza y no se repite: el QR no es una
 * decoración, es el objeto que se escanea en la puerta.
 *
 * Bajo `prefers-reduced-motion` no hay reveal ni barrido: el código aparece
 * en su estado final (ver credential-qr.css).
 */
export default function CredentialQr({
  src = null,
  alt = '',
  failed = false,
  size = 'md',
  className = '',
}) {
  const [revealed, setRevealed] = useState(false)
  const imgRef = useRef(null)
  const reveal = useCallback(() => setRevealed(true), [])

  // Un `src` nuevo (otra credencial, o el reintento después de un fallo) vuelve
  // a armar el reveal. Sin esto el segundo código entraba ya revelado, sin
  // transición, porque el estado quedaba del anterior.
  useEffect(() => {
    setRevealed(false)
    // Las data URLs largas quedan `complete` en el mismo tick del montaje: el
    // evento load se consumió antes de que el listener existiera y el código
    // quedaba invisible en `loading` para siempre (placa respirando eternamente
    // en el dorso de la credencial). Si ya está decodificado, se revela acá.
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setRevealed(true)
  }, [src])

  const state = src ? (revealed ? 'ready' : 'loading') : failed ? 'failed' : 'pending'

  return (
    <span className={`credential-qr credential-qr--${size} ${className}`.trim()} data-state={state}>
      <span className="credential-qr__plate" aria-hidden="true">
        <span className="credential-qr__grid" />
        <span className="credential-qr__eye credential-qr__eye--tl" />
        <span className="credential-qr__eye credential-qr__eye--tr" />
        <span className="credential-qr__eye credential-qr__eye--bl" />
        {failed ? (
          <QrCode className="credential-qr__fallback-icon" size={28} strokeWidth={1.2} />
        ) : null}
      </span>

      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="credential-qr__img"
          decoding="async"
          onLoad={reveal}
        />
      ) : null}

      <span className="credential-qr__sweep" aria-hidden="true" />
    </span>
  )
}
