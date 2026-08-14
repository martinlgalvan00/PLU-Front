INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  ('admin.athletes.delete', 'athletes', 'delete', 'Eliminar', 'Eliminar definitivamente atletas y sus datos operativos asociados.', 22),
  ('admin.memberships.delete', 'memberships', 'delete', 'Eliminar', 'Eliminar definitivamente una afiliación y sus dependencias operativas.', 32),
  ('admin.events.delete', 'events', 'delete', 'Eliminar', 'Eliminar definitivamente eventos y su operación asociada.', 42),
  ('admin.registrations.delete', 'registrations', 'delete', 'Eliminar', 'Eliminar definitivamente inscripciones y sus acreditaciones.', 52),
  ('admin.users.delete', 'users', 'delete', 'Eliminar', 'Eliminar cuentas de staff administrables.', 112)
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT r."id", p."key"
FROM "AccessRole" r
CROSS JOIN "AccessPermission" p
WHERE r."key" IN ('admin_maximal', 'admin_plu_arg')
  AND p."key" IN (
    'admin.athletes.delete',
    'admin.memberships.delete',
    'admin.events.delete',
    'admin.registrations.delete',
    'admin.users.delete'
  )
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
