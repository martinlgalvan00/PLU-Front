INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  ('admin.pricing.read', 'pricing', 'read', 'Ver tarifas', 'Consultar planes de afiliación y ofertas económicas.', 65),
  ('admin.pricing.write', 'pricing', 'write', 'Gestionar tarifas', 'Publicar versiones de planes y ofertas económicas.', 66)
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
  AND p."key" IN ('admin.pricing.read', 'admin.pricing.write')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
