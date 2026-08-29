import { describe, expect, it } from 'vitest'
import {
  authenticatedPortraitUrl,
  isSafeStoragePhotoPath,
  publicPortraitUrl,
} from '../server/lib/publicPortraitUrl.js'

describe('publicPortraitUrl', () => {
  it('arma URLs estables y rechaza paths que se salen del bucket', () => {
    expect(publicPortraitUrl('ath-1/foto.webp')).toBe(
      '/api/community/portrait?p=ath-1%2Ffoto.webp',
    )
    expect(authenticatedPortraitUrl('ath-1/foto.webp')).toBe(
      '/api/athletes/portrait?p=ath-1%2Ffoto.webp',
    )
    expect(isSafeStoragePhotoPath('../secret.jpg')).toBe(false)
    expect(isSafeStoragePhotoPath('solo.jpg')).toBe(false)
    expect(publicPortraitUrl('../secret.jpg')).toBeNull()
    expect(authenticatedPortraitUrl('../secret.jpg')).toBeNull()
  })
})
