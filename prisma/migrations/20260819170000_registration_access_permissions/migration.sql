INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  ('admin.registration_access.read', 'registration_access', 'read', 'Ver tandas de inscripción', 'Consultar códigos y ventanas de habilitación de afiliaciones e inscripciones.', 67),
  ('admin.registration_access.write', 'registration_access', 'write', 'Gestionar tandas de inscripción', 'Abrir, cerrar y rotar códigos de habilitación por tanda.', 68)
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
  AND p."key" IN ('admin.registration_access.read', 'admin.registration_access.write')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
