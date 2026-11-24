import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeMercadoPagoOAuthResult } from '../lib/mercadoPagoOAuthChannel.js'
import { startMercadoPagoOAuth } from '../services/paymentProfileService.js'

const POPUP_NAME = 'plu-mercado-pago-oauth'
const POPUP_FEATURES = 'popup=yes,width=560,height=760'

/**
 * Vinculación de una cuenta de Mercado Pago desde el panel.
 *
 * Abre MP en una ventana aparte para no perder lo que el staff tenga sin
 * guardar (el editor del evento, por ejemplo). La ventana se abre en el mismo
 * click, en blanco, y recién después se le carga la URL de MP: si se abriera
 * después del `await`, el navegador la trataría como un popup no pedido y la
 * bloquearía. Si igual la bloquea, `authorizationUrl` queda disponible para
 * ofrecer un enlace que el staff abre a mano.
 *
 * El resultado llega por `mercadoPagoOAuthChannel` (ver ahí por qué no sirve
 * `window.opener`).
 *
 * @param {{ onConnected?: (result: { profileId: string, created: boolean }) => void }} options
 */
export function useMercadoPagoConnect({ onConnected } = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [authorizationUrl, setAuthorizationUrl] = useState(null)
  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected

  useEffect(() => {
    if (!pending) return undefined
    return subscribeMercadoPagoOAuthResult((result) => {
      if (!result || typeof result !== 'object') return
      setPending(false)
      setAuthorizationUrl(null)
      if (result.status === 'connected' && result.profileId) {
        setError(null)
        onConnectedRef.current?.(result)
        return
      }
      setError({ code: result.code ?? null, status: result.status ?? 'error' })
    })
  }, [pending])

  const connect = useCallback(async ({ profileId = null, name = '' } = {}) => {
    setError(null)
    setAuthorizationUrl(null)
    let popup = null
    try {
      popup = window.open('about:blank', POPUP_NAME, POPUP_FEATURES)
    } catch {
      popup = null
    }
    setPending(true)
    try {
      const url = await startMercadoPagoOAuth({ profileId, name })
      if (popup && !popup.closed) {
        popup.location.href = url
        popup.focus?.()
      } else {
        setAuthorizationUrl(url)
        setError({ code: 'POPUP_BLOCKED', status: 'blocked' })
      }
    } catch (requestError) {
      try {
        popup?.close()
      } catch {
        // ya cerrada
      }
      setPending(false)
      setError({
        code: requestError?.body?.code ?? null,
        status: 'error',
        message: requestError?.status < 500 ? requestError?.message : null,
      })
    }
  }, [])

  const cancel = useCallback(() => {
    setPending(false)
    setAuthorizationUrl(null)
  }, [])

  return { connect, cancel, pending, error, authorizationUrl, clearError: () => setError(null) }
}
