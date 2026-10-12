import { describe, expect, it } from 'vitest'
import {
  addToCart,
  cartCount,
  cartLineKey,
  cartTotal,
  loadCart,
  reconcileCart,
  removeLine,
  saveCart,
  SHOP_CART_MAX_LINES,
  SHOP_CART_STORAGE_KEY,
  setLineQuantity,
  toOrderItems,
} from '../src/lib/shopCart.js'

const hoodie = {
  id: 'p1',
  title: 'Buzo',
  category: 'apparel',
  price: 48000,
  imageUrls: ['http://img/a.jpg'],
  inStock: true,
  sizes: [
    { label: 'M', inStock: true },
    { label: 'XL', inStock: false },
  ],
}
const course = {
  id: 'c1',
  title: 'Curso',
  category: 'course',
  price: 45000,
  imageUrls: [],
  inStock: true,
  sizes: [],
  course: { startsAt: '2027-03-20T16:00:00.000Z' },
}

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

describe('carrito de la tienda', () => {
  it('agrega por producto y talle, y suma la cantidad del mismo renglón', () => {
    let lines = addToCart([], hoodie, { sizeLabel: 'M' })
    lines = addToCart(lines, hoodie, { sizeLabel: 'M' })
    lines = addToCart(lines, hoodie, { sizeLabel: 'L' })

    expect(lines.map((line) => [line.key, line.quantity])).toEqual([
      [cartLineKey('p1', 'M'), 2],
      [cartLineKey('p1', 'L'), 1],
    ])
    expect(cartCount(lines)).toBe(3)
    expect(cartTotal(lines)).toBe(48000 * 3)
  })

  it('una inscripción a un curso es de una sola persona', () => {
    let lines = addToCart([], course)
    lines = addToCart(lines, course)
    expect(lines[0].quantity).toBe(1)
    expect(setLineQuantity(lines, lines[0].key, 5)[0].quantity).toBe(1)
  })

  it('tope de 10 unidades por renglón y quitar al llegar a cero', () => {
    let lines = addToCart([], hoodie, { sizeLabel: 'M', quantity: 9 })
    lines = addToCart(lines, hoodie, { sizeLabel: 'M', quantity: 5 })
    expect(lines[0].quantity).toBe(10)
    expect(setLineQuantity(lines, lines[0].key, 0)).toEqual([])
    expect(removeLine(lines, lines[0].key)).toEqual([])
  })

  it('no pasa del máximo de renglones', () => {
    let lines = []
    for (let index = 0; index < SHOP_CART_MAX_LINES + 3; index += 1) {
      lines = addToCart(lines, { ...hoodie, id: `p${index}` }, { sizeLabel: 'M' })
    }
    expect(lines).toHaveLength(SHOP_CART_MAX_LINES)
  })

  it('al servidor solo viajan producto, talle y cantidad: nunca el precio', () => {
    const lines = addToCart([], hoodie, { sizeLabel: 'M', quantity: 2 })
    expect(toOrderItems(lines)).toEqual([{ productId: 'p1', sizeLabel: 'M', quantity: 2 }])
  })
})

describe('reconciliar el carrito con el catálogo', () => {
  const base = addToCart(addToCart([], hoodie, { sizeLabel: 'M' }), course)

  it('actualiza el precio y avisa del cambio', () => {
    const { lines, notes } = reconcileCart(base, [{ ...hoodie, price: 52000 }, course])
    expect(lines.find((line) => line.productId === 'p1').price).toBe(52000)
    expect(notes).toEqual([{ type: 'price', title: 'Buzo', from: 48000, to: 52000 }])
  })

  it('saca lo que ya no está, lo agotado y el talle sin stock', () => {
    const soldOutSize = reconcileCart(base, [
      { ...hoodie, sizes: [{ label: 'M', inStock: false }] },
      course,
    ])
    expect(soldOutSize.lines.map((line) => line.productId)).toEqual(['c1'])
    expect(soldOutSize.notes[0]).toMatchObject({ type: 'unavailable', sizeLabel: 'M' })

    const gone = reconcileCart(base, [{ ...hoodie, inStock: false }])
    expect(gone.lines).toEqual([])
    expect(gone.notes).toHaveLength(2)
  })

  it('sin cambios no genera avisos', () => {
    expect(reconcileCart(base, [hoodie, course]).notes).toEqual([])
  })
})

describe('persistencia', () => {
  it('guarda y recupera, y vacía la clave con el carrito vacío', () => {
    const storage = memoryStorage()
    const lines = addToCart([], hoodie, { sizeLabel: 'M' })
    saveCart(storage, lines)
    expect(loadCart(storage)).toEqual(lines)
    saveCart(storage, [])
    expect(storage.data[SHOP_CART_STORAGE_KEY]).toBeUndefined()
  })

  it('un dato roto o manipulado no rompe la tienda', () => {
    expect(loadCart(memoryStorage({ [SHOP_CART_STORAGE_KEY]: '{no es json' }))).toEqual([])
    expect(loadCart(memoryStorage({ [SHOP_CART_STORAGE_KEY]: '{"a":1}' }))).toEqual([])
    const tampered = JSON.stringify([
      { productId: 'p1', category: 'apparel', quantity: 999, price: -5, title: 'x'.repeat(500) },
      { productId: '', category: 'apparel', quantity: 1 },
      { productId: 'p2', category: 'course', quantity: 4 },
      null,
    ])
    const lines = loadCart(memoryStorage({ [SHOP_CART_STORAGE_KEY]: tampered }))
    expect(lines.map((line) => [line.productId, line.quantity, line.price])).toEqual([
      ['p1', 10, 0],
      ['p2', 1, 0],
    ])
    expect(lines[0].title).toHaveLength(120)
  })

  it('sin almacenamiento disponible no lanza', () => {
    expect(loadCart(null)).toEqual([])
    expect(() => saveCart(null, [])).not.toThrow()
  })
})
