import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

function expectModel(name) {
  expect(schema).toContain(`model ${name} {`)
}

describe('prisma schema normalization contract', () => {
  it('normaliza identidad, atleta y documentos', () => {
    expectModel('UserIdentity')
    expectModel('UserProfile')
    expectModel('AthleteDocument')
    expect(schema).toContain('firstName')
    expect(schema).toContain('lastName')
    expect(schema).toContain('@@unique([documentType, documentNumber])')
  })

  it('modela pagos e inscripciones con relaciones consultables', () => {
    expectModel('PaymentAllocation')
    expect(schema).toMatch(/\borderType\s+PaymentOrderType\b/)
    expect(schema).toMatch(/\bmembershipId\s+String\?/)
    expect(schema).toMatch(/\bpaymentOrderId\s+String\?/)
    expect(schema).toContain('@@unique([athleteId, year])')
    expect(schema).toContain('@@unique([eventId, athleteId])')
  })

  it('incluye personalizacion de usuario separada del core transaccional', () => {
    expectModel('UserPreference')
    expectModel('UserSavedView')
    expectModel('UserTablePreference')
    expectModel('UserNotificationPreference')
    expectModel('UserRecentEntity')
    expect(schema).toContain('@@unique([userId, scope])')
    expect(schema).toContain('@@unique([userId, tableKey])')
  })

  it('declara indices para joins y auditoria', () => {
    expect(schema).toContain('@@index([athleteId, status])')
    expect(schema).toContain('@@index([eventId, status])')
    expect(schema).toContain('@@index([entityType, entityId])')
    expect(schema).toContain('@@index([type, status])')
  })

  it('modela eventos de integracion idempotentes y auditables', () => {
    expectModel('IntegrationEvent')
    expectModel('IntegrationAttempt')
    expect(schema).toContain('enum IntegrationProvider')
    expect(schema).toContain('enum IntegrationEventStatus')
    expect(schema).toMatch(/\bidempotencyKey\s+String\?\s+@unique/)
    expect(schema).toContain('@@unique([provider, externalId])')
    expect(schema).toContain('@@index([provider, type, status])')
    expect(schema).toContain('@@index([entityType, entityId])')
  })
})
