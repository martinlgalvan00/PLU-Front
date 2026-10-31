import { describe, expect, it } from 'vitest'
import {
  formatManualScanInput,
  gateCodeUtterance,
  prepareCheckinScan,
  publicSpokenName,
} from '../src/lib/doorSpokenCode.js'
import { checkinVerdictUtterance } from '../src/lib/doorCodeSpeech.js'

describe('código de puerta cantado', () => {
  it('arma el XXX-XXX desde lo que se canta', () => {
    const prepared = prepareCheckinScan('ka cuatro eme, siete cu pe')
    expect(prepared.kind).toBe('door')
    expect(prepared.display).toBe('K4M-7QP')
    expect(prepared.repairs).toEqual(['speech'])
  })

  it('acomoda lo tipeado con espacios y minúsculas', () => {
    expect(prepareCheckinScan('k4m 7qp')).toMatchObject({ kind: 'door', display: 'K4M-7QP' })
    expect(formatManualScanInput('k4m7qp')).toBe('K4M-7QP')
  })

  it('rechaza I, L, O, 0 y 1 en vez de adivinarlos', () => {
    expect(prepareCheckinScan('K4I-7QP').reason).toBe('ambiguous')
    expect(prepareCheckinScan('ele cuatro eme siete cu pe').reason).toBe('ambiguous')
    expect(prepareCheckinScan('123456').reason).toBe('ambiguous')
  })

  it('no trata un QR ni un TCK como código de puerta', () => {
    const token = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    expect(prepareCheckinScan(token).kind).toBe('credential')
    expect(prepareCheckinScan('TCK-00000001').kind).toBe('credential')
    expect(prepareCheckinScan('https://plu.test/?credencial=abc').kind).toBe('credential')
  })

  it('pide los seis signos si la frase quedó corta', () => {
    const prepared = prepareCheckinScan('ka cuatro eme')
    expect(prepared.kind).toBe('malformed')
    expect(prepared.reason).toBe('length')
    expect(prepared.heard).toBe(3)
  })

  it('canta el código en dos grupos y la entrada sin el documento', () => {
    expect(gateCodeUtterance('K4M-7QP')).toBe('ka cuatro eme. siete cu pe')
    expect(publicSpokenName('Ana Pérez 30111222')).toBe('Ana')
    expect(checkinVerdictUtterance({ outcome: 'ready', name: 'Ana Pérez', credentialLabel: 'ENTRENADOR' })).toBe(
      'Ana. ENTRENADOR. Puede ingresar.',
    )
    expect(checkinVerdictUtterance({ outcome: 'ready', name: '30111222' })).toBe('Puede ingresar.')
  })
})
