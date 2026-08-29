import { describe, expect, it } from 'vitest'
import { fitImageWithin } from '../src/lib/compressImageFile.js'
import {
  missingAthletePhotoPaths,
  preserveAthletePhotoUrls,
  reuseRecentPortraitsInSummary,
} from '../src/lib/signedPhotoUrls.js'

describe('fitImageWithin', () => {
  it('no agranda una foto que ya entra', () => {
    expect(fitImageWithin(400, 300, 720)).toEqual({ width: 400, height: 300 })
  })

  it('mantiene la proporción al recortar el lado largo', () => {
    expect(fitImageWithin(2400, 1800, 720)).toEqual({ width: 720, height: 540 })
  })
})

describe('preserveAthletePhotoUrls', () => {
  it('reusa la URL firmada si el photo_path no cambió', () => {
    const previous = [
      { id: 'a1', photoPath: 'a1.jpg', photoUrl: 'https://signed.test/old' },
      { id: 'a2', photoPath: 'a2.jpg', photoUrl: 'https://signed.test/a2' },
    ]
    const next = [
      { id: 'a1', photoPath: 'a1.jpg', photoUrl: null, fullName: 'Ana' },
      { id: 'a2', photoPath: 'a2-new.jpg', photoUrl: null, fullName: 'Bruno' },
    ]

    expect(preserveAthletePhotoUrls(previous, next)).toEqual([
      { id: 'a1', photoPath: 'a1.jpg', photoUrl: 'https://signed.test/old', fullName: 'Ana' },
      { id: 'a2', photoPath: 'a2-new.jpg', photoUrl: null, fullName: 'Bruno' },
    ])
  })
})

describe('reuseRecentPortraitsInSummary', () => {
  it('conserva el src anterior para no re-bajar el retrato en cada poll', () => {
    const previous = {
      registered: 12,
      recent: [
        {
          displayName: 'Ana T.',
          registeredAt: '2026-08-28T12:00:00Z',
          photoUrl: 'https://signed.test/ana?token=old',
        },
      ],
    }
    const next = {
      registered: 12,
      recent: [
        {
          displayName: 'Ana T.',
          registeredAt: '2026-08-28T12:00:00Z',
          photoUrl: 'https://signed.test/ana?token=new',
        },
      ],
    }

    expect(reuseRecentPortraitsInSummary(previous, next).recent[0].photoUrl).toBe(
      'https://signed.test/ana?token=old',
    )
  })
})

describe('missingAthletePhotoPaths', () => {
  it('lista solo los retratos que el poll no trajo firmados', () => {
    expect(
      missingAthletePhotoPaths([
        { photoPath: 'a.jpg', photoUrl: 'https://signed.test/a' },
        { photoPath: 'b.jpg', photoUrl: null },
        { photoPath: 'b.jpg', photoUrl: null },
      ]),
    ).toEqual(['b.jpg'])
  })
})
