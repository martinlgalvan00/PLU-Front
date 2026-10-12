import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { eventInitials, resolveEventLogo } from '../src/lib/eventMark.js'
import { validateEventLogoFile } from '../src/services/eventAdminService.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('logo del evento — API', () => {
  it('las dos rutas exigen sesión de staff', async () => {
    const target = listen(createApp())
    try {
      const responses = await Promise.all([
        fetch(`${target.url}/api/events/pitbull-classic-2026/logo/upload-url`, {
          method: 'POST',
          headers: mutationHeaders,
          body: JSON.stringify({ contentType: 'image/png', size: 1000 }),
        }),
        fetch(`${target.url}/api/events/pitbull-classic-2026/logo`, {
          method: 'PATCH',
          headers: mutationHeaders,
          body: JSON.stringify({ path: null }),
        }),
      ])
      expect(responses.map((response) => response.status)).toEqual([401, 401])
    } finally {
      await target.close()
    }
  })
})

describe('logo del evento — validación en el cliente', () => {
  it('acepta JPG, PNG y WebP chicos', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateEventLogoFile({ type, size: 1024 }).ok).toBe(true)
    }
  })

  it('rechaza otros formatos y archivos de más de 3 MB', () => {
    expect(validateEventLogoFile(null).error).toBeTruthy()
    expect(validateEventLogoFile({ type: 'image/gif', size: 1024 }).error).toMatch(/JPG, PNG o WEBP/)
    expect(validateEventLogoFile({ type: 'application/pdf', size: 1024 }).error).toBeTruthy()
    expect(validateEventLogoFile({ type: 'image/png', size: 3 * 1024 * 1024 + 1 }).error).toMatch(
      /3 MB/,
    )
  })
})

describe('marca del evento', () => {
  it('el logo subido manda sobre el asset de la marca', () => {
    expect(
      resolveEventLogo({ slug: 'pitbull-classic', title: 'Pitbull', logoUrl: 'https://cdn.test/x.webp' }),
    ).toBe('https://cdn.test/x.webp')
  })

  it('sin logo propio, Pitbull usa su asset y el resto cae a monograma', () => {
    expect(resolveEventLogo({ slug: 'pitbull-classic-2026', title: 'Pitbull Classic' })).toBeTruthy()
    expect(resolveEventLogo({ slug: 'copa-norte', title: 'Copa Norte' })).toBeNull()
  })

  it('arma las iniciales sin años ni conectores', () => {
    expect(eventInitials('Copa Norte')).toBe('CN')
    expect(eventInitials('Copa del Norte 2026')).toBe('CN')
    expect(eventInitials('Open')).toBe('OP')
    expect(eventInitials('')).toBe('·')
  })
})
