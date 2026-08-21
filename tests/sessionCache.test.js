import { describe, expect, it } from 'vitest'
import { createSessionCache } from '../server/lib/sessionCache.js'

/**
 * La caché de sesión ahorra una consulta por request autenticado, pero lo que
 * cachea es una decisión de autorización. Estos tests fijan las propiedades que
 * la vuelven segura: que expire, que se pueda purgar por token y por persona, y
 * que no crezca sin techo.
 *
 * Si alguna se rompe, el síntoma no es un error: es una cuenta suspendida que
 * sigue entrando.
 */

describe('createSessionCache', () => {
  it('devuelve lo guardado antes del TTL y nada después', () => {
    const cache = createSessionCache({ ttlMs: 1000 })
    cache.set('token-a', { user: 'ana' }, { ownerKey: 'u1', now: 0 })

    expect(cache.get('token-a', 999)).toEqual({ user: 'ana' })
    expect(cache.get('token-a', 1000)).toBeNull()
  })

  it('purga una sesión puntual: es el logout', () => {
    const cache = createSessionCache()
    cache.set('token-a', { user: 'ana' }, { ownerKey: 'u1' })
    cache.set('token-b', { user: 'ana' }, { ownerKey: 'u1' })

    cache.invalidateKey('token-a')

    expect(cache.get('token-a')).toBeNull()
    // Cerrar sesión en un dispositivo no cierra los otros.
    expect(cache.get('token-b')).toEqual({ user: 'ana' })
  })

  it('purga todas las sesiones de una persona: es el cambio de rol o la baja', () => {
    const cache = createSessionCache()
    cache.set('token-a', { user: 'ana' }, { ownerKey: 'u1' })
    cache.set('token-b', { user: 'ana' }, { ownerKey: 'u1' })
    cache.set('token-c', { user: 'beto' }, { ownerKey: 'u2' })

    cache.invalidateOwner('u1')

    expect(cache.get('token-a')).toBeNull()
    expect(cache.get('token-b')).toBeNull()
    expect(cache.get('token-c')).toEqual({ user: 'beto' })
  })

  it('reindexa al reemplazar una entrada, así la purga por persona no la pierde', () => {
    const cache = createSessionCache()
    // El mismo token resuelto primero a un dueño y después a otro: sin soltar el
    // índice anterior, el token quedaba colgado del dueño viejo y
    // `invalidateOwner` del nuevo no lo alcanzaba -- una sesión inmune a la
    // revocación.
    cache.set('token-a', { user: 'ana' }, { ownerKey: 'u1' })
    cache.set('token-a', { user: 'beto' }, { ownerKey: 'u2' })

    cache.invalidateOwner('u2')
    expect(cache.get('token-a')).toBeNull()
  })

  it('no guarda un resultado vacío', () => {
    const cache = createSessionCache()
    cache.set('token-a', null, { ownerKey: 'u1' })
    cache.set('token-b', undefined, { ownerKey: 'u1' })

    expect(cache.size).toBe(0)
  })

  it('respeta el techo de entradas', () => {
    const cache = createSessionCache({ maxEntries: 3 })
    for (let index = 0; index < 10; index += 1) {
      cache.set(`token-${index}`, { index }, { ownerKey: `u${index}` })
    }

    expect(cache.size).toBe(3)
    // Las últimas sobreviven; las primeras se soltaron.
    expect(cache.get('token-9')).toEqual({ index: 9 })
    expect(cache.get('token-0')).toBeNull()
  })

  it('no deja índices colgados al desalojar por techo', () => {
    const cache = createSessionCache({ maxEntries: 2 })
    cache.set('token-a', { v: 1 }, { ownerKey: 'u1' })
    cache.set('token-b', { v: 2 }, { ownerKey: 'u1' })
    cache.set('token-c', { v: 3 }, { ownerKey: 'u1' })

    // 'token-a' salió por techo. Purgar al dueño no debe explotar ni resucitarlo.
    cache.invalidateOwner('u1')
    expect(cache.size).toBe(0)
  })

  it('clear vacía todo: es lo que usa la baja masiva de cuentas de puerta', () => {
    const cache = createSessionCache()
    cache.set('token-a', { v: 1 }, { ownerKey: 'u1' })
    cache.set('token-b', { v: 2 }, { ownerKey: 'u2' })

    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.get('token-a')).toBeNull()
    // Y después de vaciar sigue funcionando.
    cache.set('token-c', { v: 3 }, { ownerKey: 'u3' })
    expect(cache.get('token-c')).toEqual({ v: 3 })
  })

  it('una entrada vencida se suelta al leerla, no queda ocupando lugar', () => {
    const cache = createSessionCache({ ttlMs: 100 })
    cache.set('token-a', { v: 1 }, { ownerKey: 'u1', now: 0 })
    expect(cache.size).toBe(1)

    cache.get('token-a', 500)
    expect(cache.size).toBe(0)
  })

  it('ignora claves vacías en vez de guardarlas', () => {
    const cache = createSessionCache()
    cache.set('', { v: 1 })
    cache.set(null, { v: 1 })

    expect(cache.size).toBe(0)
    expect(cache.get('')).toBeNull()
    expect(cache.get(null)).toBeNull()
  })
})
