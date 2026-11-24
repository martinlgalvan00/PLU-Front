import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * Agrupa una ráfaga de avisos en una sola llamada: espera `debounceMs` de
 * silencio, pero nunca más de `maxWaitMs` desde el primer aviso. En plena
 * entrada una puerta recibe un `checkin-changed` por cada ingreso de las otras;
 * sin esto cada uno dispararía una relectura.
 */
export function createCoalescer(fn, { debounceMs = 400, maxWaitMs = 2000 } = {}) {
  let timer = null
  let firstAt = null

  function flush() {
    timer = null
    firstAt = null
    fn()
  }

  return {
    trigger() {
      const now = Date.now()
      if (firstAt === null) firstAt = now
      if (timer) clearTimeout(timer)
      const wait = Math.max(0, Math.min(debounceMs, firstAt + maxWaitMs - now))
      timer = setTimeout(flush, wait)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      firstAt = null
    },
  }
}

/**
 * Escucha un tópico de Supabase Realtime y llama a `onChange` (agrupado) cuando
 * llega cualquiera de `events`. Los avisos no traen datos: `onChange` relee por
 * la API con la sesión y los permisos de quien mira.
 *
 * Tolerancia a fallos, porque un aviso perdido es un dato viejo en la puerta:
 *   - Al reconectar (el socket se cayó y volvió) se llama una vez a `onChange`:
 *     lo que pasó mientras tanto no se va a volver a anunciar.
 *   - Al volver a la pestaña también: el navegador frena los sockets en
 *     segundo plano.
 *   - Si Realtime no conecta, `connected` queda en false y el caller mantiene
 *     su sondeo; nada depende de que el aviso llegue.
 *
 * @returns {{ connected: boolean }}
 */
export function useBroadcastTopic(
  topic,
  events,
  onChange,
  { enabled = true, debounceMs = 400, maxWaitMs = 2000 } = {},
) {
  const [connected, setConnected] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const eventsKey = (events ?? []).join('|')

  useEffect(() => {
    if (!enabled || !topic || !isSupabaseConfigured) {
      setConnected(false)
      return undefined
    }

    let disposed = false
    let client = null
    let channel = null
    let everSubscribed = false
    let lostConnection = false
    const coalescer = createCoalescer(() => {
      if (!disposed) onChangeRef.current?.()
    }, { debounceMs, maxWaitMs })

    function handleVisibility() {
      if (document.visibilityState === 'visible') coalescer.trigger()
    }

    void getSupabaseClient()
      .then((supabase) => {
        if (disposed || !supabase) return
        client = supabase
        channel = supabase.channel(topic, { config: { broadcast: { self: false } } })
        for (const name of eventsKey.split('|').filter(Boolean)) {
          channel.on('broadcast', { event: name }, () => coalescer.trigger())
        }
        channel.subscribe((status) => {
          if (disposed) return
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            if (everSubscribed && lostConnection) coalescer.trigger()
            everSubscribed = true
            lostConnection = false
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false)
            lostConnection = true
          }
        })
      })
      .catch(() => {
        if (!disposed) setConnected(false)
      })

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      coalescer.cancel()
      document.removeEventListener('visibilitychange', handleVisibility)
      setConnected(false)
      if (client && channel) void client.removeChannel(channel)
    }
  }, [debounceMs, enabled, eventsKey, maxWaitMs, topic])

  return { connected }
}
