-- Consolida el panel en cuatro roles jerárquicos:
-- Super Admin > Administrador > PLU > Seguridad.
-- User.role sigue siendo el rol base compatible; AccessRole define la
-- identidad visible y su matriz efectiva.

INSERT INTO "AccessRole" (
  "id",
  "key",
  "name",
  "description",
  "baseRole",
  "isSystem",
  "isProtected",
  "assignableByAdmin",
  "active",
  "updatedAt"
)
VALUES (
  'plu_arg',
  'plu_arg',
  'PLU',
  'Representación operativa de la federación con permisos configurables.',
  'operador_plu_arg',
  true,
  false,
  true,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "baseRole" = EXCLUDED."baseRole",
  "isSystem" = EXCLUDED."isSystem",
  "isProtected" = EXCLUDED."isProtected",
  "assignableByAdmin" = EXCLUDED."assignableByAdmin",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "AccessRole"
SET
  "name" = CASE "key"
    WHEN 'admin_maximal' THEN 'Super Admin'
    WHEN 'admin_plu_arg' THEN 'Administrador'
    WHEN 'seguridad_plu_arg' THEN 'Seguridad'
    ELSE "name"
  END,
  "description" = CASE "key"
    WHEN 'admin_maximal' THEN 'Control total del panel, roles y permisos.'
    WHEN 'admin_plu_arg' THEN 'Acceso total y supervisión de permisos para PLU y Seguridad.'
    WHEN 'seguridad_plu_arg' THEN 'Control de acceso y check-in con alcance configurable.'
    ELSE "description"
  END,
  "isSystem" = true,
  "isProtected" = CASE
    WHEN "key" IN ('admin_maximal', 'admin_plu_arg') THEN true
    ELSE false
  END,
  "assignableByAdmin" = CASE
    WHEN "key" IN ('plu_arg', 'seguridad_plu_arg') THEN true
    ELSE false
  END,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('admin_maximal', 'admin_plu_arg', 'plu_arg', 'seguridad_plu_arg');

INSERT INTO "AuditLog" (
  "id",
  "action",
  "entityType",
  "entityId",
  "actorId",
  "before",
  "after",
  "metadata",
  "createdAt"
)
SELECT
  concat('rbac4-', md5(u."id" || clock_timestamp()::text || random()::text)),
  'user.access_role_migrated',
  'user',
  u."id",
  NULL,
  jsonb_build_object('roleKey', u."accessRoleId", 'baseRole', u."role"::text),
  jsonb_build_object(
    'roleKey',
    CASE
      WHEN u."role" = 'admin_maximal'::"UserRole" THEN 'admin_maximal'
      WHEN u."role" = 'admin_plu_arg'::"UserRole" THEN 'admin_plu_arg'
      WHEN u."role" = 'seguridad_plu_arg'::"UserRole" THEN 'seguridad_plu_arg'
      ELSE 'plu_arg'
    END,
    'baseRole',
    u."role"::text
  ),
  jsonb_build_object('source', 'four_role_hierarchy_migration'),
  CURRENT_TIMESTAMP
FROM "User" AS u
WHERE u."accessRoleId" IS DISTINCT FROM CASE
  WHEN u."role" = 'admin_maximal'::"UserRole" THEN 'admin_maximal'
  WHEN u."role" = 'admin_plu_arg'::"UserRole" THEN 'admin_plu_arg'
  WHEN u."role" = 'seguridad_plu_arg'::"UserRole" THEN 'seguridad_plu_arg'
  ELSE 'plu_arg'
END;

UPDATE "Session"
SET
  "revokedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL
  AND "userId" IN (
    SELECT u."id"
    FROM "User" AS u
    WHERE u."accessRoleId" IS DISTINCT FROM CASE
      WHEN u."role" = 'admin_maximal'::"UserRole" THEN 'admin_maximal'
      WHEN u."role" = 'admin_plu_arg'::"UserRole" THEN 'admin_plu_arg'
      WHEN u."role" = 'seguridad_plu_arg'::"UserRole" THEN 'seguridad_plu_arg'
      ELSE 'plu_arg'
    END
  );

UPDATE "User"
SET
  "accessRoleId" = CASE
    WHEN "role" = 'admin_maximal'::"UserRole" THEN 'admin_maximal'
    WHEN "role" = 'admin_plu_arg'::"UserRole" THEN 'admin_plu_arg'
    WHEN "role" = 'seguridad_plu_arg'::"UserRole" THEN 'seguridad_plu_arg'
    ELSE 'plu_arg'
  END,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "AccessRole"
SET
  "active" = false,
  "assignableByAdmin" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" NOT IN ('admin_maximal', 'admin_plu_arg', 'plu_arg', 'seguridad_plu_arg');

DELETE FROM "AccessRolePermission";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'admin_maximal', "key" FROM "AccessPermission";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'admin_plu_arg', "key" FROM "AccessPermission";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey") VALUES
  ('plu_arg', 'admin.dashboard.read'),
  ('plu_arg', 'admin.athletes.read'),
  ('plu_arg', 'admin.memberships.read'),
  ('plu_arg', 'admin.events.read'),
  ('plu_arg', 'admin.registrations.read'),
  ('plu_arg', 'admin.results.read'),
  ('plu_arg', 'admin.exports.admin'),
  ('seguridad_plu_arg', 'admin.events.read'),
  ('seguridad_plu_arg', 'admin.checkin.execute');

INSERT INTO "AuditLog" (
  "id",
  "action",
  "entityType",
  "entityId",
  "actorId",
  "before",
  "after",
  "metadata",
  "createdAt"
)
SELECT
  concat('rbac4-role-', md5(role_key || clock_timestamp()::text || random()::text)),
  'access_role.hierarchy_configured',
  'access_role',
  role_key,
  NULL,
  NULL,
  jsonb_build_object(
    'hierarchyLevel',
    hierarchy_level,
    'protected',
    role_key IN ('admin_maximal', 'admin_plu_arg')
  ),
  jsonb_build_object('source', 'four_role_hierarchy_migration'),
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('admin_maximal', 1),
    ('admin_plu_arg', 2),
    ('plu_arg', 3),
    ('seguridad_plu_arg', 4)
) AS hierarchy(role_key, hierarchy_level);
