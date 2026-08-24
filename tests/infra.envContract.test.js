import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * infra.envContract.test.js — PLU ARG
 *
 * `.env.example` es el unico contrato entre el codigo y quien monta un
 * entorno. Cuando se desincroniza, falla de la peor manera posible: el deploy
 * arranca, responde 200 y recien se nota que faltaba una variable cuando un
 * cobro no acredita o un mail no sale.
 *
 * Dos direcciones, las dos rotas en silencio:
 * - una variable critica que el codigo lee y el ejemplo no documenta -> se
 *   despliega sin ella;
 * - una variable documentada que ya nadie lee -> se configura de gusto y da
 *   una sensacion falsa de completitud.
 */

const EXAMPLE = readFileSync(resolve('.env.example'), 'utf8')
const GITIGNORE = readFileSync(resolve('.gitignore'), 'utf8')

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

// `shared/` aloja codigo que leen server y cliente (p. ej. wisePricing.js);
// si el contrato no lo escanea, toda variable que viva ahi aparece como muerta.
const SOURCE_ROOTS = ['server', 'src', 'scripts', 'shared'].filter((dir) =>
  existsSync(resolve(dir)),
)

const SOURCES = SOURCE_ROOTS.flatMap((dir) => walk(resolve(dir)))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const DOCUMENTED = [...EXAMPLE.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})\s*=/gm)].map(
  (match) => match[1],
)

/**
 * Variables cuya ausencia rompe algo que no se ve al desplegar: el cobro, la
 * firma del webhook, el origen permitido, el cron. No es la lista completa de
 * lo que el server lee -- las de ajuste fino (timeouts, tamaños de lote) tienen
 * default y no hacen falta en el ejemplo.
 */
const CRITICAS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'AUTH_SECRET',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'MERCADO_PAGO_ENV',
  'VITE_MERCADO_PAGO_PUBLIC_KEY',
  'PAYMENTS_MOCK',
  'APP_URL',
  'BREVO_API_KEY',
  'BREVO_SENDER_EMAIL',
  'ANALYTICS_SALT_SECRET',
  'ALLOWED_ORIGINS',
  'CRON_SECRET',
]

describe('contrato de variables de entorno', () => {
  it('documenta todas las variables criticas', () => {
    const faltantes = CRITICAS.filter((key) => !DOCUMENTED.includes(key))
    expect(faltantes).toEqual([])
  })

  it('no documenta variables que ya nadie lee', () => {
    const muertas = DOCUMENTED.filter((key) => !new RegExp(`\\b${key}\\b`).test(SOURCES))
    expect(muertas).toEqual([])
  })

  it('el ejemplo no contiene secretos reales', () => {
    // Un token de MP o una service key pegados "para probar" quedan en el
    // historial de git para siempre, aunque se borren en el commit siguiente.
    const sospechosos = EXAMPLE.split('\n').filter((line) => {
      const [, value = ''] = line.match(/^\s*[A-Z][A-Z0-9_]*\s*=\s*(.*)$/) ?? []
      const clean = value.trim().replace(/^["']|["']$/g, '')
      if (!clean || clean.startsWith('#')) return false
      // JWT de Supabase, access token de produccion de Mercado Pago, API key
      // de Brevo.
      return /^eyJ[\w-]{20,}/.test(clean) || /^APP_USR-/.test(clean) || /^xkeysib-/.test(clean)
    })

    expect(sospechosos).toEqual([])
  })

  it('el archivo real de entorno nunca se versiona', () => {
    expect(GITIGNORE).toMatch(/^\.env$/m)
    expect(GITIGNORE).toMatch(/^\.env\.local$/m)
  })

  it('el ejemplo avisa como se comporta el checkout sin credenciales', () => {
    // PAYMENTS_MOCK es el interruptor que decide si un checkout cobra de
    // verdad. Tiene que estar explicado, no solo listado.
    expect(EXAMPLE).toMatch(/PAYMENTS_MOCK/)
    expect(EXAMPLE.toLowerCase()).toMatch(/mock|simul/)
  })
})
