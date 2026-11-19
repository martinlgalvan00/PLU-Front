import { describe, expect, it } from 'vitest'
import {
  ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE,
  ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_UNREADABLE_MESSAGE,
} from '../shared/athleteDocuments.js'
import {
  ATHLETE_DOCUMENT_MAX_EDGE,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES,
  ATHLETE_PHOTO_MAX_EDGE,
  SHOP_PRODUCT_MAX_EDGE,
  compressAthleteDocumentFile,
  fitImageWithin,
} from '../src/lib/compressImageFile.js'
import {
  missingAthletePhotoPaths,
  preserveAthletePhotoUrls,
  reuseRecentPortraitsInSummary,
} from '../src/lib/signedPhotoUrls.js'

describe('fitImageWithin', () => {
  it('no agranda una foto que ya entra', () => {
    expect(fitImageWithin(400, 300, ATHLETE_PHOTO_MAX_EDGE)).toEqual({ width: 400, height: 300 })
  })

  it('mantiene la proporción al recortar el lado largo', () => {
    expect(fitImageWithin(2400, 1800, ATHLETE_PHOTO_MAX_EDGE)).toEqual({
      width: ATHLETE_PHOTO_MAX_EDGE,
      height: Math.round((1800 * ATHLETE_PHOTO_MAX_EDGE) / 2400),
    })
  })

  it('acota fotos de catálogo al borde de shop product', () => {
    expect(fitImageWithin(4000, 3000, SHOP_PRODUCT_MAX_EDGE)).toEqual({
      width: SHOP_PRODUCT_MAX_EDGE,
      height: Math.round((3000 * SHOP_PRODUCT_MAX_EDGE) / 4000),
    })
  })

  it('acota documentos de afiliación al lado largo del legajo', () => {
    expect(fitImageWithin(4000, 3000, ATHLETE_DOCUMENT_MAX_EDGE)).toEqual({
      width: ATHLETE_DOCUMENT_MAX_EDGE,
      height: Math.round((3000 * ATHLETE_DOCUMENT_MAX_EDGE) / 4000),
    })
  })
})

describe('compressAthleteDocumentFile', () => {
  it('deja un PDF liviano y rechaza uno pesado', async () => {
    const small = new File([new Uint8Array(12 * 1024)], 'cert.pdf', { type: 'application/pdf' })
    await expect(compressAthleteDocumentFile(small)).resolves.toBe(small)

    const heavy = new File([new Uint8Array(32)], 'cert.pdf', { type: 'application/pdf' })
    Object.defineProperty(heavy, 'size', { value: ATHLETE_DOCUMENT_PDF_MAX_BYTES + 1 })
    await expect(compressAthleteDocumentFile(heavy)).rejects.toMatchObject({
      code: 'DOCUMENT_PDF_TOO_LARGE',
    })
  })

  it('deja una foto chica si este entorno no puede rasterizar', async () => {
    const photo = new File([new Uint8Array(80)], 'dni.jpg', { type: 'image/jpeg' })
    await expect(compressAthleteDocumentFile(photo)).resolves.toBe(photo)
  })

  it('no devuelve una foto que sigue por encima de 400 KB', async () => {
    const photo = new File([new Uint8Array(32)], 'dni.jpg', { type: 'image/jpeg' })
    Object.defineProperty(photo, 'size', { value: ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES + 1 })
    await expect(compressAthleteDocumentFile(photo)).rejects.toMatchObject({
      code: 'DOCUMENT_STILL_TOO_LARGE',
      message: ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
    })
  })

  it('pide un JPG si el navegador no puede abrir un HEIC', async () => {
    const heic = new File([new Uint8Array(80)], 'dni.heic', { type: 'image/heic' })
    await expect(compressAthleteDocumentFile(heic)).rejects.toMatchObject({
      code: 'DOCUMENT_HEIC_UNSUPPORTED',
      message: ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE,
    })
  })

  it('no deja pasar un GIF si no lo pudo convertir', async () => {
    const gif = new File([new Uint8Array(80)], 'dni.gif', { type: 'image/gif' })
    await expect(compressAthleteDocumentFile(gif)).rejects.toMatchObject({
      code: 'DOCUMENT_UNREADABLE',
      message: ATHLETE_DOCUMENT_UNREADABLE_MESSAGE,
    })
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
