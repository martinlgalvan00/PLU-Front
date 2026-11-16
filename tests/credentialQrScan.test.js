import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import {
  CREDENTIAL_QR_BRANDED_QUIET_PX,
  CREDENTIAL_QR_QUIET_MODULES,
  buildAthleteCredentialUrl,
  parseCredentialScan,
  readCredentialParams,
} from '../src/lib/credentialQr.js'
import { buildTicketQrUrl } from '../src/lib/ticketAdmission.js'
import { prepareCheckinScan } from '../src/lib/doorSpokenCode.js'

/**
 * Tres capas del mismo QR:
 * 1. el texto que sale de la credencial y el que entra por el lector
 * 2. la imagen, decodificada con el mismo jsQR de la puerta
 * 3. el puesto, que tiene que quedarse con el token y no con la URL
 */

const TOKEN = '11111111-1111-4111-8111-111111111111'

function rasterize(url, { margin = CREDENTIAL_QR_QUIET_MODULES, scale = 6 } = {}) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const modules = qr.modules.size
  const dim = (modules + margin * 2) * scale
  const data = new Uint8ClampedArray(dim * dim * 4)
  data.fill(255)
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.modules.get(row, col)) continue
      for (let py = 0; py < scale; py += 1) {
        for (let px = 0; px < scale; px += 1) {
          const x = (col + margin) * scale + px
          const y = (row + margin) * scale + py
          const index = (y * dim + x) * 4
          data[index] = 0x0d
          data[index + 1] = 0x0e
          data[index + 2] = 0x11
        }
      }
    }
  }
  return { data, width: dim, height: dim }
}

describe('payload del QR', () => {
  it('la credencial de la persona no embebe evento ni tipo', () => {
    const parsed = parseCredentialScan(buildAthleteCredentialUrl(TOKEN))

    expect(parsed).toEqual({ code: TOKEN, eventSlug: null, type: null })
  })

  it('la entrada conserva tipo y evento', () => {
    const parsed = parseCredentialScan(
      buildTicketQrUrl({ qrToken: TOKEN, eventSlug: 'pitbull-classic-2026' }),
    )

    expect(parsed).toEqual({
      code: TOKEN,
      eventSlug: 'pitbull-classic-2026',
      type: 'ticket',
    })
  })

  it.each([
    ['url en mayúsculas', `HTTPS://PLU.TEST/?CREDENCIAL=${TOKEN.toUpperCase()}&EVENTO=meet&TIPO=Ticket`],
    ['token pelado en mayúsculas', TOKEN.toUpperCase()],
    ['token cortado por un espacio', TOKEN.slice(0, 18) + ' ' + TOKEN.slice(18)],
    ['url entre comillas', `"https://plu.test/?credencial=${TOKEN}"`],
    ['url entre ángulos', `<https://plu.test/?credencial=${TOKEN}>`],
    ['query sin esquema', `?credencial=${TOKEN}&tipo=ticket`],
    ['hash', `https://plu.test/#/?credencial=${TOKEN}&tipo=TICKET`],
    ['carácter invisible', `https://plu.test/?credencial=${TOKEN}\u200b`],
  ])('lee %s', (_label, raw) => {
    const parsed = parseCredentialScan(raw)
    expect(parsed.code).toBe(TOKEN)
  })

  it('no manda a buscar una URL que no es una credencial', () => {
    expect(parseCredentialScan('https://plu.test/')).toBeNull()
    expect(parseCredentialScan('')).toBeNull()
  })

  it('un código de socio no se pasa a minúsculas', () => {
    expect(parseCredentialScan('https://plu.test/?credencial=PLU-ARG-2026-014').code).toBe(
      'PLU-ARG-2026-014',
    )
  })

  it('la página abierta con el parámetro en mayúsculas igual lee el token', () => {
    window.history.replaceState({}, '', `/?CREDENCIAL=${TOKEN.toUpperCase()}&tipo=ticket`)

    expect(readCredentialParams()).toEqual({
      code: TOKEN,
      eventSlug: null,
      type: 'ticket',
    })
    window.history.replaceState({}, '', '/')
  })
})

describe('imagen que escanea la puerta', () => {
  it('deja zona muda suficiente para el lector', () => {
    expect(CREDENTIAL_QR_QUIET_MODULES).toBeGreaterThanOrEqual(4)
    expect(CREDENTIAL_QR_BRANDED_QUIET_PX).toBeGreaterThanOrEqual(32)
  })

  it('jsQR recupera la URL de la persona y el parser el token', () => {
    const url = buildAthleteCredentialUrl(TOKEN)
    const image = rasterize(url)
    const decoded = jsQR(image.data, image.width, image.height)

    expect(decoded?.data).toBe(url)
    expect(parseCredentialScan(decoded.data).code).toBe(TOKEN)
  })

  it('jsQR recupera la entrada con su tipo', () => {
    const url = buildTicketQrUrl({ qrToken: TOKEN }, 'pitbull-classic-2026')
    const image = rasterize(url)
    const decoded = jsQR(image.data, image.width, image.height)

    expect(parseCredentialScan(decoded?.data)).toEqual({
      code: TOKEN,
      eventSlug: 'pitbull-classic-2026',
      type: 'ticket',
    })
  })
})

describe('el puesto se queda con el token', () => {
  it('una URL ruidosa no se confunde con un código de puerta', () => {
    const prepared = prepareCheckinScan(`  "HTTPS://PLU.TEST/?CREDENCIAL=${TOKEN.toUpperCase()}"  `)

    expect(prepared.kind).toBe('credential')
    expect(prepared.parsed.code).toBe(TOKEN)
    expect(prepared.parsed.eventSlug).toBeNull()
  })

  it('una entrada sigue siendo credencial de tipo ticket', () => {
    const prepared = prepareCheckinScan(
      buildTicketQrUrl({ qrToken: TOKEN }, 'pitbull-classic-2026'),
    )

    expect(prepared.kind).toBe('credential')
    expect(prepared.parsed.type).toBe('ticket')
    expect(prepared.parsed.code).toBe(TOKEN)
  })
})
