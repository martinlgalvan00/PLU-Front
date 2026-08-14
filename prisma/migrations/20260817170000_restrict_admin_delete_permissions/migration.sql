-- 20260817140000_admin_delete_permissions otorgo los permisos de borrado
-- definitivo (atletas, afiliaciones, eventos, inscripciones, usuarios) tanto
-- a admin_maximal como a admin_plu_arg. Son operaciones irreversibles con
-- cascada de datos: quedan reservadas a Super Admin (admin_maximal).
DELETE FROM "AccessRolePermission"
WHERE "roleId" IN (SELECT "id" FROM "AccessRole" WHERE "key" = 'admin_plu_arg')
  AND "permissionKey" IN (
    'admin.athletes.delete',
    'admin.memberships.delete',
    'admin.events.delete',
    'admin.registrations.delete',
    'admin.users.delete'
  );
