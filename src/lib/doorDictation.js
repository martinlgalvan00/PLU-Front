import { chooseSpokenDoorCode } from './doorSpokenCode.js'
import { listenForDoorUtterance, speechInputSupported } from './doorCodeSpeech.js'

/**
 * Micrófono de un XXX-XXX, el mismo para la credencial del personal y para
 * la entrada. Si se entiende el código, `onAccepted` lo usa. Si devuelve
 * false, el código queda escrito para mandarlo cuando el puesto se libere.
 * Tres silencios y se puede seguir tipeando. Un permiso bloqueado no se reintenta.
 */
export function createDoorDictation({
  attempts = 3,
  onAccepted,
  onPreview,
  onNote,
  onListening,
} = {}) {
  let session = null
  let closing = false
  let misses = 0
  let active = false

  function stop() {
    closing = true
    try {
      session?.stop()
    } catch {
      // El reconocimiento ya se había cerrado solo.
    }
    session = null
    active = false
    onListening?.(false)
  }

  function handleUtterance(transcripts, isFinal) {
    const chosen = chooseSpokenDoorCode(transcripts)
    const preview = Array.isArray(transcripts) ? (transcripts[0] ?? '') : String(transcripts ?? '')
    if (!isFinal) {
      if (chosen?.kind === 'door' || chosen?.kind === 'member') onPreview?.(chosen.display)
      else if (preview) onPreview?.(preview)
      return
    }
    misses = 0
    if (chosen?.kind === 'door' || chosen?.kind === 'member') {
      stop()
      const accepted = onAccepted?.(chosen.display)
      if (accepted === false) {
        onPreview?.(chosen.display)
        onNote?.('ready')
        return
      }
      if (accepted !== 'keep') onPreview?.('')
      onNote?.('')
      return
    }
    onPreview?.(chosen?.display || preview)
    onNote?.(chosen?.kind === 'malformed' ? chosen.reason || 'length' : 'length')
    stop()
  }

  function handleEnd() {
    if (closing) {
      closing = false
      return
    }
    if (misses > 0 && misses < attempts) {
      try {
        session?.start()
        return
      } catch {
        onNote?.('missed')
      }
    }
    session = null
    active = false
    onListening?.(false)
  }

  function handleError(reason) {
    if (reason === 'no-speech') {
      misses += 1
      if (misses >= attempts) onNote?.('missed')
      return
    }
    if (reason === 'aborted') return
    misses = attempts
    onNote?.(reason === 'not-allowed' ? 'denied' : 'unavailable')
    active = false
    onListening?.(false)
  }

  function toggle() {
    if (active) {
      stop()
      return
    }
    misses = 0
    closing = false
    session = listenForDoorUtterance({
      onUtterance: handleUtterance,
      onEnd: handleEnd,
      onError: handleError,
    })
    if (!session) {
      onNote?.('unavailable')
      return
    }
    active = true
    onListening?.(true)
    onNote?.('')
    try {
      session.start()
    } catch {
      stop()
      onNote?.('unavailable')
    }
  }

  function dispose() {
    closing = true
    try {
      session?.stop()
    } catch {
      // Nada que cerrar.
    }
    session = null
    active = false
  }

  return {
    dispose,
    stop,
    supported: speechInputSupported(),
    toggle,
  }
}
