import { useEffect, useState } from 'react'
import {
  buildAthleteCredentialUrl,
  generateCredentialQr,
  peekCredentialQr,
} from '../lib/credentialQr.js'

/**
 * El PNG del QR de la persona.
 *
 * Si ese código ya se dibujó (la card del inicio, o una visita anterior a
 * Mi QR), el primer render lo muestra. Si no, se pide una sola vez y no se
 * borra la imagen mientras llega la misma de nuevo.
 *
 * @param {string | null | undefined} code Token o número que va dentro del QR.
 * @returns {{ qrSrc: string | null, qrFailed: boolean, qrBusy: boolean }}
 */
export function useAthleteCredentialQr(code) {
  const url = code ? buildAthleteCredentialUrl(code) : null
  const [qrSrc, setQrSrc] = useState(() => (url ? peekCredentialQr(url) : null))
  const [qrFailed, setQrFailed] = useState(false)

  useEffect(() => {
    if (!url) {
      setQrSrc(null)
      setQrFailed(false)
      return undefined
    }

    const ready = peekCredentialQr(url)
    if (ready) {
      setQrSrc((current) => (current === ready ? current : ready))
      setQrFailed((current) => (current ? false : current))
      return undefined
    }

    let cancelled = false
    setQrSrc(null)
    setQrFailed(false)
    generateCredentialQr(url)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setQrSrc(null)
          setQrFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return {
    qrSrc,
    qrFailed,
    qrBusy: Boolean(url) && !qrSrc && !qrFailed,
  }
}
