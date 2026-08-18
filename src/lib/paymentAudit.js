/**
 * paymentAudit.js — PLU ARG
 *
 * Formateo de la trazabilidad de rechazo de pagos para el panel.
 * `rejected_by` llega en dos vocabularios, según quién tomó la decisión:
 *
 *   · 'mercado_pago'            — lo rechazó el proveedor por webhook; el
 *                                 motivo visible es el status_detail crudo
 *                                 (cc_rejected_*) o su traducción del catálogo.
 *   · 'staff:<uuid>:<email>'    — lo rechazó Finanzas desde el panel (el mismo
 *                                 actor_label que usa la API); el motivo es el
 *                                 texto que escribió el operador.
 *
 * El formato original se conserva en la base: acá solo se decide qué se
 * muestra, para que la bandeja diga "quién" sin exponer un uuid crudo.
 */

/**
 * @param {string | null | undefined} rejectedBy
 * @param {(key: string, params?: object) => string} t
 * @returns {string} Etiqueta lista para mostrar; '—' si no hay registro.
 */
export function formatRejectionActor(rejectedBy, t) {
  const value = String(rejectedBy ?? '').trim()
  if (!value) return '—'
  if (value === 'mercado_pago') {
    return t?.('admin.payments.rejectionActorProvider') ?? 'Mercado Pago'
  }
  if (value.startsWith('staff:')) {
    // staff:<uuid>:<email> → el email es lo único identificable por un humano.
    const email = value.split(':').pop()?.trim()
    return email || value
  }
  return value
}
