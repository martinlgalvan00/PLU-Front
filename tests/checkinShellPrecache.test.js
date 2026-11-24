import { describe, expect, it } from 'vitest'
import {
  CHECKIN_SHELL_PRECACHE_IGNORE,
  isCheckinShellAsset,
} from '../src/lib/checkinShellPrecache.js'

describe('precache de la puerta', () => {
  it('deja afuera mapas, 3D, Mercado Pago y la captura de credenciales', () => {
    const ignored = CHECKIN_SHELL_PRECACHE_IGNORE.join('\n')
    expect(ignored).toContain('html2canvas')
    expect(ignored).toContain('vendor-mp')
    expect(ignored).toContain('three')
    expect(ignored).toContain('maplibre')
  })

  it('en la instalación solo guarda el arranque, no las pantallas', () => {
    expect(isCheckinShellAsset('index.html')).toBe(true)
    expect(isCheckinShellAsset('assets/index-C2IZ4ZYB.js')).toBe(true)
    expect(isCheckinShellAsset('assets/index-7ND1QZUg.css')).toBe(true)
    expect(isCheckinShellAsset('assets/vendor-react-isj4yLbd.js')).toBe(true)
    expect(isCheckinShellAsset('assets/vendor-lucide-DJHrw5J9.js')).toBe(true)
    expect(isCheckinShellAsset('assets/motion-BvP3BbMA.js')).toBe(true)
    expect(isCheckinShellAsset('assets/fonts/plu.woff2')).toBe(true)
    expect(isCheckinShellAsset('assets/CheckInAppPage-0i3zOyvZ.js')).toBe(false)
    expect(isCheckinShellAsset('assets/HomePage-CdRrrN1s.js')).toBe(false)
    expect(isCheckinShellAsset('assets/three-BlpSkPxq.js')).toBe(false)
    expect(isCheckinShellAsset('assets/maplibre-eeJy0NuH.js')).toBe(false)
  })
})
