INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  (
    'admin.analytics.read',
    'analytics',
    'read',
    'Ver analítica',
    'Consultar tráfico, recorridos y mapa de calor del sitio.',
    131
  ),
  (
    'admin.analytics.identity',
    'analytics',
    'identity',
    'Ver recorrido identificado',
    'Abrir el recorrido de navegación de un atleta puntual.',
    132
  )
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
  AND p."key" IN ('admin.analytics.read', 'admin.analytics.identity')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
