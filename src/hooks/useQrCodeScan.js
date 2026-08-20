import { useEffect, useRef, useState } from 'react'

// Frame de trabajo para el decoder de respaldo (jsQR) -- más chico que la
// resolución real de la cámara para no cargar la CPU en celulares de gama
// media. Mismo criterio que AdminQrScanner.
const FALLBACK_SCAN_WIDTH = 480
const SCAN_COOLDOWN_MS = 1500

/**
 * Cámara + decoder de QR reutilizable, generalizado a partir de
 * AdminQrScanner (que sigue con su propia copia: ese componente ya está
 * probado contra el flujo de acreditación y no vale la pena arriesgarlo por
 * una unificación). Este hook no decide cuándo cerrar — sigue escaneando
 * mientras `active` sea true, con el mismo cooldown entre lecturas, y es el
 * llamador el que decide qué hacer con cada valor leído (cerrar, mostrar un
 * error y seguir escaneando, etc).
 */
export function useQrCodeScan({ active, onDecode }) {
  const videoRef = useRef(null)
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode
  const [status, setStatus] = useState('starting')
  const [errorReason, setErrorReason] = useState(null)

  useEffect(() => {
    if (!active) {
      setStatus('starting')
      setErrorReason(null)
      return undefined
    }

    let stream
    let raf
    let detector
    let decodeQr
    let cancelled = false
    let cooldown = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function scanFrameWithFallback(video) {
      const scale = FALLBACK_SCAN_WIDTH / video.videoWidth
      canvas.width = FALLBACK_SCAN_WIDTH
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      return decodeQr(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
    }

    function emit(value) {
      cooldown = true
      onDecodeRef.current?.(value)
      window.setTimeout(() => {
        cooldown = false
      }, SCAN_COOLDOWN_MS)
    }

    async function scanLoop() {
      if (cancelled) return
      if (!videoRef.current || videoRef.current.readyState < 2) {
        raf = requestAnimationFrame(scanLoop)
        return
      }

      if (!cooldown) {
        try {
          if (detector) {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) emit(codes[0].rawValue)
          } else {
            const result = scanFrameWithFallback(videoRef.current)
            if (result?.data) emit(result.data)
          }
        } catch {
          // Frame inválido — seguimos en el próximo tick.
        }
      }

      raf = requestAnimationFrame(scanLoop)
    }

    async function startCamera() {
      setErrorReason(null)
      setStatus('starting')

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setErrorReason('unsupported')
        setStatus('error')
        return
      }

      // BarcodeDetector nativo cuando está disponible; si no (ej. Safari/iOS),
      // jsQR en JS puro cubre el resto de los navegadores. jsQR (~48kB gzip)
      // se pide recién acá — de otro modo cada pantalla con un botón de
      // escaneo cargaría ese peso aunque nadie abra la cámara, y en Chrome
      // (que sí tiene BarcodeDetector) no hace falta nunca.
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      } else {
        decodeQr = (await import('jsqr')).default
        if (cancelled) return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) return

        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await video.play()
        setStatus('ready')
        scanLoop()
      } catch {
        setErrorReason('permission')
        setStatus('error')
      }
    }

    startCamera()

    const currentVideo = videoRef.current
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      if (currentVideo) currentVideo.srcObject = null
    }
  }, [active])

  return { videoRef, status, errorReason }
}
