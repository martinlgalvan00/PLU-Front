import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

function expectModel(name) {
  expect(schema).toContain(`model ${name} {`)
}

describe('prisma schema normalization contract', () => {
  it('modela infraestructura multi-organizacion con RLS eficiente', () => {
    expectModel('Organization')
    expectModel('OrganizationMember')
    expectModel('Venue')
    expect(schema).toContain('enum OrganizationStatus')
    expect(schema).toContain('enum OrganizationMemberRole')
    expect(schema).toContain('@@unique([organizationId, userId])')
    expect(schema).toContain('@@index([organizationId, role, status])')
  })

  it('normaliza identidad, atleta y documentos', () => {
    expectModel('Person')
    expectModel('PersonDocument')
    expectModel('OrganizationAthlete')
    expectModel('UserIdentity')
    expectModel('UserProfile')
    expect(schema).toContain('firstName')
    expect(schema).toContain('lastName')
    expect(schema).toContain('@@unique([documentType, documentNumber])')
    expect(schema).toContain('@@unique([organizationId, personId])')
  })

  it('modela afiliaciones por plan y periodo sin duplicar precios historicos', () => {
    expectModel('MembershipPlan')
    expectModel('MembershipPeriod')
    expectModel('Membership')
    expect(schema).toContain('membershipPeriodId')
    expect(schema).toContain('activatedAt')
    expect(schema).toContain('expiresAt')
    expect(schema).toContain('@@unique([organizationId, membershipPlanId, year])')
    expect(schema).toContain('@@unique([organizationId, personId, membershipPeriodId])')
    expect(schema).toContain('@@index([organizationId, status, expiresAt])')
  })

  it('modela eventos, inscripciones y tickets como catalogos normalizados', () => {
    expectModel('EventRegistrationWindow')
    expectModel('EventScheduleItem')
    expectModel('EventDivision')
    expectModel('EventCategory')
    expectModel('EventCapacityRule')
    expectModel('TicketType')
    expectModel('TicketSaleWindow')
    expectModel('TicketOrder')
    expectModel('Ticket')
    expect(schema).toContain('visibilityStatus')
    expect(schema).toContain('ticketTypeId')
    expect(schema).toContain('saleWindowId')
    expect(schema).toContain('@@unique([organizationId, slug])')
    expect(schema).toContain('@@unique([eventId, code])')
    expect(schema).toContain('@@index([organizationId, visibilityStatus, startsAt])')
  })

  it('modela pagos con orden, items y asignaciones consultables', () => {
    expectModel('PaymentOrderItem')
    expectModel('PaymentAllocation')
    expect(schema).toMatch(/\btype\s+PaymentOrderType\b/)
    expect(schema).toMatch(/\bitemType\s+PaymentOrderItemType\b/)
    expect(schema).toMatch(/\bmembershipId\s+String\?/)
    expect(schema).toMatch(/\bticketOrderId\s+String\?/)
    expect(schema).toContain('@@index([organizationId, status, createdAt])')
    expect(schema).toContain('@@unique([provider, externalPaymentId])')
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
    expect(schema).toContain('@@index([personId, status])')
    expect(schema).toContain('@@index([eventId, status])')
    expect(schema).toContain('@@index([entityType, entityId])')
    expect(schema).toContain('@@index([type, status])')
  })

  it('modela eventos de integracion idempotentes y auditables', () => {
    expectModel('IntegrationEvent')
    expectModel('IntegrationAttempt')
    expectModel('OutboxEvent')
    expect(schema).toContain('enum IntegrationProvider')
    expect(schema).toContain('enum IntegrationEventStatus')
    expect(schema).toMatch(/\bidempotencyKey\s+String\?\s+@unique/)
    expect(schema).toContain('@@unique([provider, providerNotificationId])')
    expect(schema).toContain('@@index([provider, providerResourceId])')
    expect(schema).toContain('@@index([provider, type, status])')
    expect(schema).toContain('@@index([entityType, entityId])')
  })
})
