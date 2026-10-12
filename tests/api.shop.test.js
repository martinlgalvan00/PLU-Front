import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { shopProductSchema, shopSlugify } from '../server/routes/shop.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const HOODIE = {
  title: 'Buzo Pitbull Classic',
  category: 'apparel',
  price: 38000,
  sizes: [
    { label: 'M', stock: 4 },
    { label: 'L', stock: 0 },
  ],
}

describe('GET /api/shop/products', () => {
  it('devuelve el catálogo público con caché de borde, sin pasar por sesión', async () => {
    const listPublicProducts = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        slug: 'buzo-pitbull',
        title: 'Buzo Pitbull',
        category: 'apparel',
        inStock: true,
      },
    ])
    const target = listen(createApp({ shopRepository: { listPublicProducts } }))
    try {
      const response = await fetch(`${target.url}/api/shop/products`)

      expect(response.status).toBe(200)
      expect((await response.json()).products).toHaveLength(1)
      expect(response.headers.get('cache-control')).toMatch(/s-maxage=\d+/)
      expect(listPublicProducts).toHaveBeenCalledTimes(1)
    } finally {
      await target.close()
    }
  })
})

describe('administración del catálogo', () => {
  it('toda ruta del panel exige sesión', async () => {
    const repository = {
      listAdminProducts: vi.fn(),
      saveProduct: vi.fn(),
      deleteProduct: vi.fn(),
      createImageUpload: vi.fn(),
    }
    const target = listen(createApp({ shopRepository: repository }))
    const id = '3f2b5d1e-1111-4222-8333-444455556666'
    try {
      const calls = [
        fetch(`${target.url}/api/shop/admin/products`),
        fetch(`${target.url}/api/shop/admin/products`, {
          method: 'POST',
          headers: mutationHeaders,
          body: JSON.stringify(HOODIE),
        }),
        fetch(`${target.url}/api/shop/admin/products/${id}`, {
          method: 'PATCH',
          headers: mutationHeaders,
          body: JSON.stringify(HOODIE),
        }),
        fetch(`${target.url}/api/shop/admin/products/${id}`, {
          method: 'DELETE',
          headers: mutationHeaders,
        }),
        fetch(`${target.url}/api/shop/admin/images/upload-url`, {
          method: 'POST',
          headers: mutationHeaders,
          body: JSON.stringify({ fileName: 'a.jpg', contentType: 'image/jpeg', size: 1000 }),
        }),
      ]
      const statuses = (await Promise.all(calls)).map((response) => response.status)

      expect(statuses).toEqual([401, 401, 401, 401, 401])
      expect(repository.saveProduct).not.toHaveBeenCalled()
      expect(repository.deleteProduct).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('validación del producto', () => {
  const parse = (overrides) => shopProductSchema.safeParse({ ...HOODIE, ...overrides })

  it('acepta una prenda con talles y le da valores por defecto seguros', () => {
    const result = parse({})
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ status: 'draft', featured: false, imagePaths: [] })
  })

  it('rechaza precios negativos, talles repetidos y rutas de imagen ajenas al bucket', () => {
    expect(parse({ price: -1 }).success).toBe(false)
    expect(
      parse({
        sizes: [
          { label: 'M', stock: 1 },
          { label: 'm', stock: 2 },
        ],
      }).success,
    ).toBe(false)
    expect(parse({ imagePaths: ['../otro-bucket/x.jpg'] }).success).toBe(false)
    expect(parse({ imagePaths: ['products/foto-1.webp'] }).success).toBe(true)
  })

  it('un curso no lleva talles y para publicarse necesita fecha y modalidad', () => {
    const course = { title: 'Curso de jueces', category: 'course', price: 25000, sizes: [] }
    expect(shopProductSchema.safeParse({ ...course, status: 'draft' }).success).toBe(true)
    expect(shopProductSchema.safeParse({ ...course, status: 'published' }).success).toBe(false)
    expect(
      shopProductSchema.safeParse({
        ...course,
        status: 'published',
        courseStartsAt: '2026-11-20T13:00:00-03:00',
        courseModality: 'presencial',
      }).success,
    ).toBe(true)
    expect(
      shopProductSchema.safeParse({ ...course, sizes: [{ label: 'M', stock: 1 }] }).success,
    ).toBe(false)
  })

  it('una exclusiva de torneo necesita el torneo para publicarse', () => {
    const exclusive = { title: 'Remera finalista', category: 'exclusive', price: 30000 }
    expect(shopProductSchema.safeParse({ ...exclusive, status: 'published' }).success).toBe(false)
    expect(
      shopProductSchema.safeParse({
        ...exclusive,
        status: 'published',
        eventId: '3f2b5d1e-1111-4222-8333-444455556666',
      }).success,
    ).toBe(true)
  })
})

describe('slug', () => {
  it('normaliza acentos y símbolos', () => {
    expect(shopSlugify('Buzo Pitbull Classic · Edición 2026')).toBe(
      'buzo-pitbull-classic-edicion-2026',
    )
    expect(shopSlugify('  ¡Remera!  ')).toBe('remera')
  })
})

describe('POST /api/contact con motivo curso', () => {
  it('lo acepta y lo marca en el asunto', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'abc' })
    const target = listen(createApp({ brevo: { send } }))
    try {
      const response = await fetch(`${target.url}/api/contact`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          name: 'Lucía',
          email: 'lucia@example.com',
          message: 'Quiero inscribirme al curso de jueces.',
          motive: 'curso',
        }),
      })
      expect(response.status).toBe(200)
      expect(send.mock.calls[0][0].subject).toContain('(curso)')
    } finally {
      await target.close()
    }
  })
})

describe('control de versión del esquema de producto', () => {
  it('acepta la versión con microsegundos tal como la devuelve la base y la deja opcional', () => {
    const withVersion = shopProductSchema.safeParse({
      ...HOODIE,
      expectedUpdatedAt: '2026-10-12T13:00:00.123456+00:00',
    })
    expect(withVersion.success).toBe(true)
    expect(withVersion.data.expectedUpdatedAt).toBe('2026-10-12T13:00:00.123456+00:00')
    expect(shopProductSchema.safeParse(HOODIE).success).toBe(true)
    expect(shopProductSchema.safeParse({ ...HOODIE, expectedUpdatedAt: null }).success).toBe(true)
  })

  it('rechaza una versión que no es una fecha', () => {
    expect(shopProductSchema.safeParse({ ...HOODIE, expectedUpdatedAt: 'ayer' }).success).toBe(false)
  })
})
