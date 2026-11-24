import { describe, expect, it } from 'vitest'
import {
  TICKET_GATE_CODE_ALPHABET,
  generateGateCode,
  isGateCode,
  normalizeGateCode,
  resolveTicketDoorCredential,
} from '../src/lib/ticketGateCode.js'

const QR_TOKEN = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

describe('código de puerta', () => {
  it('normaliza lo que se dicta al mismo XXX-XXX', () => {
    expect(normalizeGateCode('k4m-7qp')).toBe('K4M-7QP')
    expect(normalizeGateCode('k4m 7qp')).toBe('K4M-7QP')
    expect(normalizeGateCode('k4m7qp')).toBe('K4M-7QP')
    expect(isGateCode('K4M-7QP')).toBe(true)
  })

  it('no acepta letras ambiguas ni el número correlativo ni el QR', () => {
    expect(normalizeGateCode('K4I-7QP')).toBeNull()
    expect(normalizeGateCode('K4L-7QP')).toBeNull()
    expect(normalizeGateCode('K4O-7QP')).toBeNull()
    expect(normalizeGateCode('K40-7QP')).toBeNull()
    expect(normalizeGateCode('K41-7QP')).toBeNull()
    expect(normalizeGateCode('TCK-00000001')).toBeNull()
    expect(isGateCode(QR_TOKEN)).toBe(false)
  })

  it('genera seis caracteres del alfabeto dictable', () => {
    const code = generateGateCode(() => 0)
    expect(code).toBe('AAA-AAA')
    expect(code).toHaveLength(7)
    for (const char of code.replace('-', '')) {
      expect(TICKET_GATE_CODE_ALPHABET.includes(char)).toBe(true)
    }
  })

  it('el código dictado resuelve al mismo token que el QR', async () => {
    const lookup = async (gateCode) => (gateCode === 'K4M-7QP' ? QR_TOKEN : null)
    await expect(resolveTicketDoorCredential('k4m 7qp', lookup)).resolves.toBe(QR_TOKEN)
    await expect(resolveTicketDoorCredential(QR_TOKEN, lookup)).resolves.toBe(QR_TOKEN)
  })

  it('un código que no existe no se trata como otra credencial', async () => {
    await expect(resolveTicketDoorCredential('k4m-7qp', async () => null)).resolves.toBeNull()
    await expect(resolveTicketDoorCredential('k4m-7qp')).resolves.toBeNull()
  })
})
