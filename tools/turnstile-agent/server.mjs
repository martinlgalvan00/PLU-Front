/**
 * Agente local del molinete. Escucha sólo en la notebook.
 *
 *   node tools/turnstile-agent/server.mjs
 *
 * POST http://127.0.0.1:4877/open  { "pulseMs": 800 }
 *
 * Si TURNSTILE_SERIAL_PORT está definido, escribe un byte de apertura, espera
 * el pulso y escribe el de cierre. Si el puerto no responde, el HTTP falla
 * para que el puesto avise sin repetir el ingreso. Sin puerto, sólo registra
 * el pulso: el aparato se enchufa después.
 */
import { createServer } from 'node:http'
import { open } from 'node:fs/promises'

const host = '127.0.0.1'
const port = Number(process.env.TURNSTILE_PORT || 4877)
const serialPort = String(process.env.TURNSTILE_SERIAL_PORT || '').trim()
const openByte = Buffer.from([0x01])
const closeByte = Buffer.from([0x00])

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  })
  res.end(payload)
}

async function pulseSerial(pulseMs) {
  const handle = await open(serialPort, 'w')
  try {
    await handle.write(openByte)
    await new Promise((resolve) => setTimeout(resolve, pulseMs))
    await handle.write(closeByte)
  } finally {
    await handle.close()
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return
  }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/open') {
    send(res, 404, { opened: false })
    return
  }

  const pulseMs = 800
  if (!serialPort) {
    console.info(`[molinete] pulso ${pulseMs}ms sin puerto serie`)
    send(res, 200, { opened: true, serial: false })
    return
  }

  try {
    await pulseSerial(pulseMs)
    console.info(`[molinete] pulso ${pulseMs}ms en ${serialPort}`)
    send(res, 200, { opened: true, serial: true })
  } catch (error) {
    console.error('[molinete] no se pudo escribir el puerto', error?.message ?? error)
    send(res, 503, { opened: false })
  }
})

server.listen(port, host, () => {
  console.info(`[molinete] escuchando en http://${host}:${port}`)
})
