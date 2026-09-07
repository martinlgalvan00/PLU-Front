import { describe, expect, it } from 'vitest'
import { SCAN_COOLDOWN_MS, shouldAcceptScan } from '../src/lib/checkinScanCooldown.js'

describe('cooldown del escáner de puerta', () => {
  it('un Verificar a mano pasa aunque el mismo QR esté en cooldown', () => {
    expect(
      shouldAcceptScan({
        value: 'token-1',
        source: 'manual',
        lastValue: 'token-1',
        lastAt: 1_000,
        now: 1_200,
        cooldownMs: SCAN_COOLDOWN_MS,
      }),
    ).toBe(true)
  })

  it('la cámara ignora el mismo QR dentro del cooldown y acepta otro distinto', () => {
    expect(
      shouldAcceptScan({
        value: 'token-1',
        source: 'camera',
        lastValue: 'token-1',
        lastAt: 1_000,
        now: 1_200,
      }),
    ).toBe(false)
    expect(
      shouldAcceptScan({
        value: 'token-2',
        source: 'camera',
        lastValue: 'token-1',
        lastAt: 1_000,
        now: 1_200,
      }),
    ).toBe(true)
  })

  it('no escanea vacío, ocupado o deshabilitado', () => {
    expect(shouldAcceptScan({ value: '', source: 'manual' })).toBe(false)
    expect(shouldAcceptScan({ value: 'token-1', busy: true, source: 'manual' })).toBe(false)
    expect(shouldAcceptScan({ value: 'token-1', disabled: true, source: 'camera' })).toBe(false)
  })
})
