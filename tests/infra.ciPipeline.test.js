import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * infra.ciPipeline.test.js — PLU ARG
 *
 * Tests del pipeline que corre los tests.
 *
 * Un CI puede quedar verde por dos motivos opuestos: porque todo pasa, o porque
 * dejo de correr. Lo segundo no avisa. Un `continue-on-error` puesto para
 * destrabar un merge, un job que se saltea por una condicion mal escrita, un
 * proyecto de vitest que ya no matchea ningun archivo -- todos dejan el check
 * en verde con cero cobertura real.
 *
 * `deploymentFlow.test.js` ya fija donde dispara CI y la version del CLI de
 * Supabase. Esto fija que efectivamente ejecute lo que decimos que ejecuta.
 */

const CI = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')
const SMOKE = readFileSync(resolve('.github/workflows/deployment-smoke.yml'), 'utf8')
const RECOVERY_CRON = readFileSync(resolve('.github/workflows/payment-recovery-cron.yml'), 'utf8')
const PKG = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const VITEST = readFileSync(resolve('vitest.config.js'), 'utf8')

describe('pipeline de integracion continua', () => {
  it('corre las cuatro compuertas de la aplicacion', () => {
    for (const step of [
      'npm run lint',
      'npm test',
      'npm run build',
      'npx prisma validate',
      'npm audit --omit=dev --audit-level=high',
    ]) {
      expect(CI, `falta "${step}" en CI`).toContain(step)
    }
  })

  it('verifica la base real: reset, lint de esquema, integracion y ledger de pagos', () => {
    // Estos cuatro son los unicos pasos que ejercitan SQL de verdad. Sin ellos
    // las 134 migraciones solo estan probadas como texto.
    for (const step of [
      'supabase db reset',
      'supabase db lint --local --fail-on warning',
      'npm run test:integration',
      'npm run db:verify:payments',
      'npm run db:verify:schema',
    ]) {
      expect(CI, `falta "${step}" en CI`).toContain(step)
    }
  })

  it('corta las versiones de migracion duplicadas antes de tocar la base', () => {
    // El prefijo del archivo es la PK de schema_migrations: dos iguales rompen
    // `db reset` y, peor, dejan una sin aplicar en la base hosteada.
    expect(CI).toContain('uniq -d')
    expect(CI).toContain('Versiones de migración duplicadas')
  })

  it('no deja pasar fallas de forma silenciosa', () => {
    expect(CI).not.toContain('continue-on-error')
    expect(CI).not.toMatch(/\|\|\s*true/)
    expect(SMOKE).not.toContain('continue-on-error')
  })

  it('el humo de despliegue mira vida y readiness, no solo que responda', () => {
    // Un 200 en la home no dice nada: el server puede estar arriba sin base.
    expect(SMOKE).toContain('/api/health')
    expect(SMOKE).toContain('/api/ready')
    expect(SMOKE).toContain('checks?.prisma')
    expect(SMOKE).toContain('checks?.supabase')
    expect(SMOKE).toContain('--fail')
  })

  it('el humo de despliegue verifica que la instancia publicada este cerrada', () => {
    // "Responde" y "responde bien" no son lo mismo: un deploy con la caja
    // abierta o con el webhook sin verificar firma tambien devuelve 200 en
    // /api/health.
    expect(SMOKE).toContain('/api/payments/operations')
    expect(SMOKE).toContain('/api/payments/webhook/mercadopago')
    expect(SMOKE).toContain('x-powered-by')
  })

  it('el cron de recuperacion de pagos exige secreto y falla si no lo tiene', () => {
    expect(RECOVERY_CRON).toContain('/api/internal/jobs/payment-recovery')
    expect(RECOVERY_CRON).toContain('CRON_SECRET')
    expect(RECOVERY_CRON).toContain('--fail')
  })

  it('`npm test` incluye unidad y storybook, y `test:check` agrega lint y build', () => {
    expect(PKG.scripts.test).toContain('test:unit')
    expect(PKG.scripts.test).toContain('test:storybook')
    expect(PKG.scripts['test:check']).toContain('lint')
    expect(PKG.scripts['test:check']).toContain('build')
    expect(PKG.scripts['test:integration']).toContain('--project integration')
  })

  it('los tres proyectos de vitest siguen declarados y con su patron', () => {
    for (const project of ['default', 'integration', 'storybook']) {
      expect(VITEST, `falta el proyecto ${project}`).toContain(`name: '${project}'`)
    }
    expect(VITEST).toContain("include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}']")
    expect(VITEST).toContain("include: ['tests/integration/**/*.test.js']")
  })

  it('ningun archivo de tests queda fuera del patron que corre el runner', () => {
    // Un `foo.spec.js` o un `bar.tests.js` no lo levanta ningun proyecto: se
    // escribe, se commitea y no corre nunca.
    const huerfanos = readdirSync(resolve('tests'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && !/\.test\.(js|jsx)$/.test(entry.name))
      .map((entry) => entry.name)
    expect(huerfanos).toEqual([])

    const huerfanosIntegracion = readdirSync(resolve('tests/integration'), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && !/\.integration\.test\.js$/.test(entry.name) && entry.name !== 'setup.js',
      )
      .map((entry) => entry.name)
    expect(huerfanosIntegracion).toEqual([])
  })

  it('la suite de integracion cubre los flujos que mueven plata y cupos', () => {
    // Lista explicita: si alguien borra uno de estos archivos, el CI sigue
    // verde y nadie se entera de que se dejo de probar el cobro end-to-end.
    const archivos = readdirSync(resolve('tests/integration'))
    for (const esperado of [
      'mercadoPagoWebhook.integration.test.js',
      'paymentRevalidation.integration.test.js',
      'athleteMembershipFlow.integration.test.js',
      'competitionRegistrationCapacity.integration.test.js',
      'ticketPurchaseCapacity.integration.test.js',
      'ticketCheckinDuplicate.integration.test.js',
      'paymentAuditTrace.integration.test.js',
    ]) {
      expect(archivos, `falta la integracion ${esperado}`).toContain(esperado)
    }
  })
})
