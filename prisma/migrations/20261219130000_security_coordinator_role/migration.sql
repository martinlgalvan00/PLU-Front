-- Coordinador de seguridad: cuenta por evento que arma el equipo de puerta,
-- las zonas, la lista y el escaneo. No cobra ni edita el evento.
--
-- baseRole operador_plu_arg a propósito: el listado de cuentas de puerta filtra
-- role = seguridad_plu_arg, y el coordinador no es un puesto de escaneo.
-- Alcance `event`: los eventos salen de UserEventAccess, igual que el organizador.
--
-- Aditivo e idempotente. Corre después de access_role_scope (columna scope) y
-- de event_team.write. La matriz se recorta a estos tres permisos para que un
-- retoque manual no le deje cobros o edición del evento.

INSERT INTO "AccessRole" (
  "id", "key", "name", "description", "baseRole", "scope",
  "isSystem", "isProtected", "assignableByAdmin", "active", "updatedAt"
)
VALUES (
  'coordinador_seguridad',
  'coordinador_seguridad',
  'Coordinador de seguridad',
  'Coordina la puerta de los eventos que se le asignan: equipo, zonas, lista y escaneo.',
  'operador_plu_arg',
  'event',
  true, false, true, true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "baseRole" = EXCLUDED."baseRole",
  "scope" = EXCLUDED."scope",
  "isSystem" = EXCLUDED."isSystem",
  "assignableByAdmin" = EXCLUDED."assignableByAdmin",
  "active" = true;

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'coordinador_seguridad', p."key"
FROM "AccessPermission" p
WHERE p."key" IN (
  'admin.events.read',
  'admin.checkin.execute',
  'admin.event_team.write'
)
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;

DELETE FROM "AccessRolePermission"
WHERE "roleId" = 'coordinador_seguridad'
  AND "permissionKey" NOT IN (
    'admin.events.read',
    'admin.checkin.execute',
    'admin.event_team.write'
  );
