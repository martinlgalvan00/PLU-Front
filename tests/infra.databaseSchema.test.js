import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * infra.databaseSchema.test.js — PLU ARG
 *
 * Invariantes de las 134 migraciones, barridas de punta a punta.
 *
 * Los tests de migracion que ya existen (`billingMigration`,
 * `adminHardDeleteMigration`, `manualPaymentSettlement`, ...) verifican **una**
 * migracion cada uno: que la funcion que agrego haga lo que dice. Ninguno mira
 * el conjunto, y las reglas que sostienen la seguridad del esquema son
 * justamente de conjunto: alcanza con que UNA funcion nueva se olvide del
 * `search_path` o del `revoke` para abrir un agujero que ningun test de esa
 * migracion iba a mirar.
 *
 * `supabase db lint` corre en CI y cubre otras cosas (tipos, indices, shadowing),
 * pero no la postura de privilegios: una funcion `security definer` con grant a
 * `anon` es SQL perfectamente valido.
 */

const DIR = resolve('supabase/migrations')
const FILES = readdirSync(DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
/**
 * Los comentarios se sacan antes de auditar: varias migraciones **describen**
 * en prosa el riesgo que evitan ("un `disable row level security` puesto para
 * depurar y olvidado..."), y buscar sobre el texto crudo confunde la
 * advertencia con el problema.
 */
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

const SQL = new Map(
  FILES.map((file) => [file, stripSqlComments(readFileSync(resolve(DIR, file), 'utf8'))]),
)
const ALL_SQL = [...SQL.values()].join('\n')

/**
 * Cabecera de cada `create function`: desde el nombre hasta el cuerpo. Es
 * donde viven `security definer`, `set search_path` y `language`, que es todo
 * lo que se audita acá.
 */
function functionHeaders(sql) {
  return sql
    .split(/create\s+(?:or\s+replace\s+)?function\s+/i)
    .slice(1)
    .map((block) => ({
      name: (block.match(/^([a-z0-9_."]+)/i) ?? [])[1] ?? 'desconocida',
      header: block.slice(0, block.search(/\$[a-z_]*\$/i) + 1 || 2_000),
    }))
}

describe('postura de seguridad del esquema', () => {
  it('barre el corpus completo de migraciones', () => {
    // Si el glob se rompe, el resto de los tests pasarian sobre cero archivos.
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('toda funcion security definer fija su search_path', () => {
    // Sin `set search_path`, una funcion definer resuelve nombres con el path
    // de quien la llama: basta crear un `public.now()` o una tabla homonima en
    // un schema propio para desviar lo que ejecuta con privilegios de owner.
    const definers = []
    const sinSearchPath = []

    for (const [file, sql] of SQL) {
      for (const { name, header } of functionHeaders(sql)) {
        if (!/security\s+definer/i.test(header)) continue
        definers.push(`${file} :: ${name}`)
        if (!/set\s+search_path/i.test(header)) sinSearchPath.push(`${file} :: ${name}`)
      }
    }

    expect(definers.length).toBeGreaterThan(250)
    expect(sinSearchPath).toEqual([])
  })

  it('toda funcion staff_* queda cerrada al navegador y abierta solo a service_role', () => {
    // Las `staff_*` son las que mueven plata, estados y padron. El browser
    // tiene la clave `anon` publicada en el bundle: si una queda con grant a
    // `anon` o `authenticated`, se puede invocar desde afuera de Express, que
    // es donde viven los permisos.
    const definidas = new Set()
    for (const sql of SQL.values()) {
      for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(staff_[a-z0-9_]+)\s*\(/gi)) {
        definidas.add(match[1])
      }
    }

    expect(definidas.size).toBeGreaterThan(30)

    const abiertas = []
    for (const fn of definidas) {
      const revocada = new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*from[^;]*(anon|public)`,
        'i',
      ).test(ALL_SQL)
      const soloServicio = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*to\\s+service_role`,
        'i',
      ).test(ALL_SQL)
      if (!revocada || !soloServicio) abiertas.push(`${fn} (revoke=${revocada}, service_role=${soloServicio})`)
    }

    expect(abiertas).toEqual([])
  })

  it('ninguna staff_* se le concede al rol anonimo o autenticado', () => {
    const concesiones = [...ALL_SQL.matchAll(
      /grant\s+execute\s+on\s+function\s+public\.(staff_[a-z0-9_]+)\s*\([^;]*to\s+([^;]+);/gi,
    )]
      .filter(([, , roles]) => /\b(anon|authenticated|public)\b/i.test(roles))
      .map(([, fn, roles]) => `${fn} -> ${roles.trim()}`)

    expect(concesiones).toEqual([])
  })

  it('las RPC que acreditan dinero solo las puede ejecutar el backend', () => {
    // Estas cuatro son las unicas que insertan en el ledger o activan derechos.
    // Es el corte que sostiene "el frontend nunca confirma un pago".
    for (const fn of [
      'apply_mercado_pago_payment',
      'apply_ticket_mercado_pago_payment',
      'apply_subscription_payment',
      'staff_force_settle_payment_order',
    ]) {
      const revocada = new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*from[^;]*anon`,
        'i',
      ).test(ALL_SQL)
      const servicio = new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*to\\s+service_role`,
        'i',
      ).test(ALL_SQL)
      expect(revocada, `${fn} sin revoke`).toBe(true)
      expect(servicio, `${fn} sin grant a service_role`).toBe(true)
    }
  })

  it('ninguna version de migracion esta duplicada', () => {
    // El prefijo del archivo es la clave primaria de
    // `supabase_migrations.schema_migrations`: dos archivos con el mismo
    // timestamp hacen fallar `db reset` con 23505 y, en una base donde uno ya
    // quedo registrado, dejan al otro sin aplicar sin que nada avise. CI tiene
    // la misma guarda en shell; esto la corre tambien en local.
    const porVersion = new Map()
    for (const file of FILES) {
      const version = file.slice(0, 14)
      porVersion.set(version, [...(porVersion.get(version) ?? []), file])
    }

    const duplicadas = [...porVersion.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => `${version}: ${files.join(' + ')}`)

    expect(duplicadas).toEqual([])
  })

  it('las migraciones llevan prefijo de version valido y ordenable', () => {
    const malFormadas = FILES.filter((file) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(file))
    expect(malFormadas).toEqual([])
  })

  it('ninguna migracion desactiva RLS', () => {
    // `disable row level security` puesto para depurar y olvidado es
    // exactamente el descuido que la capa de privilegios minimos
    // (20260818120000) da por supuesto que no va a pasar.
    const apagones = []
    for (const [file, sql] of SQL) {
      if (/disable\s+row\s+level\s+security/i.test(sql)) apagones.push(file)
    }
    expect(apagones).toEqual([])
  })
})
