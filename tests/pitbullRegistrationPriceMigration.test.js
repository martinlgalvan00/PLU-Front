import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812170000_pitbull_registration_price_75k.sql'),
  'utf8',
)
const registrationOpenMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812171000_pitbull_registration_open.sql'),
  'utf8',
)
const seed = readFileSync(resolve(process.cwd(), 'supabase/seed.sql'), 'utf8')

describe('precio de inscripción Pitbull Classic', () => {
  it('corrige el catálogo Supabase a ARS 75.000 de forma identificable', () => {
    expect(migration).toContain("slug = 'pitbull-classic-2026'")
    expect(migration).toContain('set price = 75000')
    expect(migration).toContain("currency = 'ARS'")
    expect(migration).toContain("'registrationPrice', 75000")
    expect(migration).toContain("'migration:20260812170000'")
  })

  it('abre la inscripcion real para que la RPC no rechace el checkout', () => {
    expect(registrationOpenMigration).toContain("slug = 'pitbull-classic-2026'")
    expect(registrationOpenMigration).toContain("status = 'inscripcion_abierta'")
    expect(registrationOpenMigration).toContain('published = true')
    expect(registrationOpenMigration).toContain("'migration:20260812171000'")
  })

  it('siembra Pitbull abierto: db reset aplica seed despues de las migraciones', () => {
    expect(seed).toMatch(
      /'pitbull-classic-2026'[\s\S]*?'inscripcion_abierta'[\s\S]*?85000,\s*75000,\s*'ARS'/,
    )
    expect(seed).toContain("'membershipManualPrice', 75000")
    expect(seed).toContain("'comboManualPrice', 120000")
    expect(seed).toContain('insert into public.event_combo_offers')
  })

  it('siembra la oferta combo activa, con precio pactado y una ventana que abre antes de cerrar', () => {
    // La fecha de cierre NO se afirma por literal.
    //
    // Esta prueba tenia clavado `2026-08-28` dentro de un
    // `toMatch(/120000...true...2026-08-28/)`. El dia que la ventana del combo se
    // extendio —una decision de negocio sobre `supabase/seed.sql`, no un bug— el
    // test se puso rojo sin que nada se hubiera roto, y peor: senalaba el precio
    // (120000) cuando lo que habia cambiado era la fecha. Un test que se rompe
    // cuando el negocio hace lo que tiene que hacer no protege nada, entrena a
    // ignorarlo.
    //
    // Lo que importa de la siembra es la forma y el invariante: la oferta entra
    // activa, con el precio pactado y la moneda, y con una ventana que abre antes
    // de cerrar. Si alguien invierte las fechas o desactiva la oferta, esto lo
    // agarra; si el negocio corre el cierre, no.
    const start = seed.indexOf('insert into public.event_combo_offers')
    const combo = seed.slice(start, seed.indexOf(';', start) + 1)

    expect(combo).toMatch(/120000,\s*'ARS',\s*true/)

    const stamps = [...combo.matchAll(/timestamptz '([^']+)'/g)].map((match) => match[1])
    expect(stamps.length, 'la oferta combo tiene que sembrar starts_at y ends_at').toBe(2)

    // Postgres acepta el separador con espacio y el offset de dos digitos; el
    // `Date` de JS quiere ISO estricto, asi que se normaliza antes de comparar.
    const toDate = (raw) => new Date(raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
    const [startsAt, endsAt] = stamps.map(toDate)
    expect(Number.isNaN(startsAt.getTime()), `starts_at ilegible: ${stamps[0]}`).toBe(false)
    expect(Number.isNaN(endsAt.getTime()), `ends_at ilegible: ${stamps[1]}`).toBe(false)
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime())
  })
})
