import { useEffect, useState } from 'react'
import Pill from './Pill.jsx'
import {
  clearEmailVerificationToken,
  readEmailVerificationToken,
} from '../../lib/emailVerificationRoute.js'
import { verifyAthleteEmail } from '../../services/athleteApi.js'

/**
 * EmailVerificationNotice — PLU ARG
 *
 * Consume el deep link `/?verificar=<token>` que llega por email. Es un flujo
 * de un solo paso, así que no merece una pantalla propia: se resuelve al
 * cargar y se informa con el mismo `status-pill` que ya usa el resto del
 * sistema, sin introducir un patrón visual nuevo.
 *
 * El token se limpia de la URL apenas se consume, para que no quede en el
 * historial ni se reenvíe al compartir el link.
 */
export default function EmailVerificationNotice() {
  const [state, setState] = useState(() => (readEmailVerificationToken() ? 'verificando' : 'inactivo'))
  const [attempt, setAttempt] = useState(0)
  const [retryableError, setRetryableError] = useState(false)

  useEffect(() => {
    const token = readEmailVerificationToken()
    if (!token) return

    let cancelled = false
    verifyAthleteEmail(token)
      .then(() => {
        if (cancelled) return
        setState('confirmado')
        setRetryableError(false)
        clearEmailVerificationToken()
        // El snapshot en memoria todavía dice que el correo está sin
        // confirmar; sin este aviso el banner de la cuenta seguía pidiendo la
        // verificación que el atleta acababa de hacer.
        window.dispatchEvent(new CustomEvent('plu:email-verified'))
      })
      .catch((error) => {
        if (cancelled) return
        // Un 4xx indica un token inválido o vencido. Los fallos de red y 5xx
        // son recuperables: conservar el token permite reintentar sin pedir
        // otro correo ni dejar una cuenta recién creada trabada.
        const canRetry = ![400, 401, 403, 404].includes(Number(error?.status))
        setRetryableError(canRetry)
        setState('error')
        if (!canRetry) clearEmailVerificationToken()
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    if (state !== 'confirmado') return
    const timer = setTimeout(() => setState('inactivo'), 6000)
    return () => clearTimeout(timer)
  }, [state])

  if (state === 'inactivo') return null

  const contenido = {
    verificando: { tone: 'info', text: 'Confirmando tu correo…' },
    confirmado: { tone: 'success', text: 'Tu correo quedó confirmado. Ya podés afiliarte e inscribirte.' },
    error: {
      tone: 'danger',
      text: retryableError
        ? 'No pudimos confirmar el correo ahora. Reintentá en unos segundos.'
        : 'El enlace no es válido o venció. Pedí uno nuevo desde tu cuenta.',
    },
  }[state]

  return (
    <div className="email-verification-notice" role="status" aria-live="polite">
      <Pill tone={contenido.tone}>{contenido.text}</Pill>
      {state === 'error' && retryableError ? (
        <button type="button" onClick={() => {
          setState('verificando')
          setAttempt((current) => current + 1)
        }}>
          Reintentar
        </button>
      ) : null}
    </div>
  )
}
