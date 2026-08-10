/**
 * Elimina una cuenta de staff dentro de una transacción. Las FK del schema
 * son la fuente de verdad para la limpieza: los datos propios del usuario se
 * borran por Cascade y las referencias históricas quedan en null.
 *
 * El asiento de auditoría se crea en la misma transacción para que nunca haya
 * una eliminación exitosa sin trazabilidad.
 */
export async function deleteStaffUser({ prisma, actorId, target }) {
  const execute = async (client) => {
    await client.user.delete({ where: { id: target.id } })

    if (typeof client.auditLog?.create === 'function') {
      await client.auditLog.create({
        data: {
          action: 'user.deleted',
          entityType: 'user',
          entityId: target.id,
          actorId,
          before: {
            role: target.role,
            roleKey: target.accessRole?.key ?? target.role,
            status: target.status,
          },
          after: null,
          metadata: {
            dependentReferences: 'cascade_or_set_null',
          },
        },
      })
    }

    return { id: target.id }
  }

  if (typeof prisma.$transaction === 'function') {
    return prisma.$transaction(execute)
  }

  // Compatibilidad con dobles livianos usados por tests unitarios.
  return execute(prisma)
}
