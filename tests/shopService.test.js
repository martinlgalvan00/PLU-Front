import { describe, expect, it } from 'vitest'
import {
  categorySupportsSizes,
  groupShopProductsByTab,
  SHOP_PRODUCT_DEFAULT,
  toShopProductDraft,
  toShopProductPayload,
  validateShopImageFile,
} from '../src/services/shopService.js'

const base = { ...SHOP_PRODUCT_DEFAULT, title: '  Buzo Pitbull  ', price: '48000.4' }

describe('toShopProductPayload', () => {
  it('una prenda manda talles con stock entero y descarta los vacíos y los datos de curso', () => {
    const payload = toShopProductPayload({
      ...base,
      category: 'apparel',
      sizes: [
        { label: ' M ', stock: '4.6' },
        { label: '', stock: 9 },
        { label: 'L', stock: -2 },
      ],
      courseStartsAt: '2027-03-20T13:00',
      courseCapacity: 20,
      eventId: 'abc',
    })

    expect(payload.title).toBe('Buzo Pitbull')
    expect(payload.price).toBe(48000)
    expect(payload.sizes).toEqual([
      { label: 'M', stock: 5 },
      { label: 'L', stock: 0 },
    ])
    expect(payload.stock).toBe(0)
    expect(payload.courseStartsAt).toBeNull()
    expect(payload.courseCapacity).toBeNull()
    expect(payload.eventId).toBeNull()
  })

  it('sin talles usa el stock único', () => {
    const payload = toShopProductPayload({ ...base, category: 'accessories', stock: '7' })
    expect(payload.sizes).toEqual([])
    expect(payload.stock).toBe(7)
  })

  it('una exclusiva lleva torneo y rótulo de edición', () => {
    const payload = toShopProductPayload({
      ...base,
      category: 'exclusive',
      eventId: '3f2b5d1e-1111-4222-8333-444455556666',
      editionNote: ' Edición limitada ',
    })
    expect(payload.eventId).toBe('3f2b5d1e-1111-4222-8333-444455556666')
    expect(payload.editionNote).toBe('Edición limitada')
  })

  it('un curso manda fecha ISO, modalidad y cupo, y nunca talles ni stock', () => {
    const payload = toShopProductPayload({
      ...base,
      category: 'course',
      sizes: [{ label: 'M', stock: 3 }],
      stock: 9,
      courseStartsAt: '2027-03-20T13:00',
      courseModality: 'online',
      courseLocation: ' Zoom ',
      courseCapacity: '60',
    })
    expect(payload.sizes).toEqual([])
    expect(payload.stock).toBe(0)
    expect(payload.courseStartsAt).toMatch(/^2027-03-20T/)
    expect(payload).toMatchObject({
      courseModality: 'online',
      courseLocation: 'Zoom',
      courseCapacity: 60,
    })
  })

  it('un cupo vacío queda sin límite en lugar de cero', () => {
    const payload = toShopProductPayload({ ...base, category: 'course', courseCapacity: '' })
    expect(payload.courseCapacity).toBeNull()
  })
})

describe('toShopProductDraft', () => {
  it('lleva la fecha del curso al formato local del input y completa los vacíos', () => {
    const draft = toShopProductDraft({
      id: 'p1',
      title: 'Curso',
      category: 'course',
      courseStartsAt: '2027-03-20T16:00:00.000Z',
      imagePaths: ['products/a.jpg'],
      imageUrls: ['http://x/a.jpg'],
    })
    expect(draft.courseStartsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(draft.eventId).toBe('')
    expect(draft.courseCapacity).toBe('')
    expect(draft.imagePaths).toEqual(['products/a.jpg'])
  })
})

describe('agrupación por pestaña', () => {
  it('los accesorios viajan con la ropa y el resto va a su propia pestaña', () => {
    const groups = groupShopProductsByTab([
      { id: 1, category: 'apparel' },
      { id: 2, category: 'accessories' },
      { id: 3, category: 'exclusive' },
      { id: 4, category: 'course' },
    ])
    expect(groups.apparel.map((p) => p.id)).toEqual([1, 2])
    expect(groups.exclusive).toHaveLength(1)
    expect(groups.course).toHaveLength(1)
  })

  it('solo prendas y exclusivas admiten talles', () => {
    expect(categorySupportsSizes('apparel')).toBe(true)
    expect(categorySupportsSizes('exclusive')).toBe(true)
    expect(categorySupportsSizes('accessories')).toBe(false)
    expect(categorySupportsSizes('course')).toBe(false)
  })
})

describe('validateShopImageFile', () => {
  it('acepta imágenes livianas y rechaza otros formatos o más de 5 MB', () => {
    expect(validateShopImageFile({ type: 'image/webp', size: 1000 }).ok).toBe(true)
    expect(validateShopImageFile({ type: 'application/pdf', size: 1000 }).error).toBeTruthy()
    expect(validateShopImageFile({ type: 'image/png', size: 6 * 1024 * 1024 }).error).toBeTruthy()
    expect(validateShopImageFile(null).error).toBeTruthy()
  })
})
