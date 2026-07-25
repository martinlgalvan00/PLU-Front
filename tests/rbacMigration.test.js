import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260725120000_configurable_rbac/migration.sql',
  ),
  'utf8',
)

const hierarchyMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260725160000_four_role_hierarchy/migration.sql',
  ),
  'utf8',
)

describe('migración RBAC configurable', () => {
  it('crea catálogo, grants y relación de usuario con backfill', () => {
    expect(migration).toContain('CREATE TABLE "AccessRole"')
    expect(migration).toContain('CREATE TABLE "AccessPermission"')
    expect(migration).toContain('CREATE TABLE "AccessRolePermission"')
    expect(migration).toContain('ADD COLUMN "accessRoleId" TEXT')
    expect(migration).toMatch(/UPDATE "User"\s+SET "accessRoleId" = "role"::text/i)
  })

  it('inicializa Super Admin, Federación, Economía y permisos por acción', () => {
    expect(migration).toContain("'admin_maximal'")
    expect(migration).toContain("'federacion_plu_arg'")
    expect(migration).toContain("'economia_plu_arg'")
    expect(migration).toContain("'admin.events.read'")
    expect(migration).toContain("'admin.events.write'")
    expect(migration).toContain("'admin.payments.approve'")
  })
})

describe('migración de jerarquía de cuatro roles', () => {
  it('crea PLU y deja activos únicamente los cuatro roles oficiales', () => {
    expect(hierarchyMigration).toContain("'plu_arg'")
    expect(hierarchyMigration).toContain(
      "WHERE \"key\" NOT IN ('admin_maximal', 'admin_plu_arg', 'plu_arg', 'seguridad_plu_arg')",
    )
    expect(hierarchyMigration).toContain('"active" = false')
  })

  it('migra usuarios, revoca sesiones anteriores y audita el cambio', () => {
    expect(hierarchyMigration).toContain('user.access_role_migrated')
    expect(hierarchyMigration).toContain('UPDATE "Session"')
    expect(hierarchyMigration).toContain('UPDATE "User"')
    expect(hierarchyMigration).toContain("ELSE 'plu_arg'")
  })

  it('protege acceso total de Super Admin y Administrador', () => {
    expect(hierarchyMigration).toMatch(
      /SELECT 'admin_maximal', "key" FROM "AccessPermission"/,
    )
    expect(hierarchyMigration).toMatch(
      /SELECT 'admin_plu_arg', "key" FROM "AccessPermission"/,
    )
  })
})
