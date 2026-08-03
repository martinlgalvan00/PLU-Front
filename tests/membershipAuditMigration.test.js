import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contrato SQL de 20260802120000. Son verificaciones de texto —como el resto de
 * los tests de migración de este repo— porque el objetivo es que una edición
 * futura no reintroduzca en silencio los defectos que esta migración corrige.
 */
const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260802120000_membership_audit_credential_hardening.sql',
  ),
  'utf8',
)

const phase3 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260715000200_phase3_billing_mercado_pago.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('aprobación manual de pagos de atleta', () => {
  it('la versión vieja decidía permisos con auth.uid() contra profiles', () => {
    // Punto de partida del bug: la función solo se podía ejecutar con
    // service_role, donde auth.uid() es NULL, así que la guarda nunca podía
    // dar verdadero y ninguna transferencia se podía aprobar.
    expect(phase3).toContain('where id = auth.uid()')
  })

  it('deja de decidir autorización adentro de la base', () => {
    const body = functionBody(migration, 'create or replace function public.approve_athlete_payment_order(')
    expect(body).not.toContain('auth.uid()')
    expect(body).not.toContain('public.profiles')
  })

  it('retira la firma de un solo argumento para que no quede la versión rota', () => {
    expect(migration).toContain('drop function if exists public.approve_athlete_payment_order(uuid);')
    expect(migration).toContain(
      'grant execute on function public.approve_athlete_payment_order(uuid, text)\n  to service_role;',
    )
    expect(migration).toContain(
      'revoke all on function public.approve_athlete_payment_order(uuid, text)\n  from public, anon, authenticated;',
    )
  })

  it('mantiene Mercado Pago fuera de la aprobación manual', () => {
    const body = functionBody(migration, 'create or replace function public.approve_athlete_payment_order(')
    expect(body).toContain('Los pagos de Mercado Pago solo se aprueban por webhook.')
  })

  it('es idempotente: reaprobar no vuelve a aplicar efectos', () => {
    const body = functionBody(migration, 'create or replace function public.approve_athlete_payment_order(')
    expect(body).toContain("if v_order.status = 'aprobado' then")
    expect(body).toContain("'duplicate', true")
  })

  it('registra al responsable en la auditoría', () => {
    const body = functionBody(migration, 'create or replace function public.approve_athlete_payment_order(')
    expect(body).toContain("'payment.approved_manually'")
    expect(body).toContain('p_actor')
  })
})

describe('auditoría del ciclo de cobro', () => {
  it('audita la acreditación de Mercado Pago con el id externo del pago', () => {
    const body = functionBody(migration, 'create or replace function public.apply_mercado_pago_payment(')
    expect(body).toContain("'payment.applied'")
    expect(body).toContain("'externalPaymentId', p_external_payment_id")
  })

  it('distingue activación de revocación del derecho', () => {
    const body = functionBody(migration, 'create or replace function public.apply_mercado_pago_payment(')
    expect(body).toContain("then 'membership.activated' else 'membership.revoked' end")
    expect(body).toContain("then 'registration.confirmed' else 'registration.cancelled' end")
  })

  it('audita el vencimiento automático, que corre sin actor humano', () => {
    const body = functionBody(migration, 'create or replace function public.expire_memberships(')
    expect(body).toContain("'membership.expired'")
    expect(body).toContain("'cron'")
  })

  it('conserva la validación de monto y moneda de la orden', () => {
    const body = functionBody(migration, 'create or replace function public.apply_mercado_pago_payment(')
    expect(body).toContain('Monto o moneda no coinciden con la orden.')
    expect(body).toContain('El pago externo ya pertenece a otra orden.')
  })
})

describe('proyección pública de credencial', () => {
  const body = functionBody(
    migration,
    'create or replace function plu_private.get_membership_by_code_or_token(',
  )

  it('no devuelve el qr_token: el member_code es enumerable', () => {
    expect(body).not.toContain("'qr_token', v_membership.qr_token")
  })

  it('no devuelve documento ni contacto', () => {
    expect(body).not.toContain('document_id')
    expect(body).not.toContain('v_athlete.email')
  })

  it('incluye el check-in para que una credencial usada se vea usada', () => {
    expect(body).toContain("'check_in'")
    expect(body).toContain("'scanned_at', v_checkin.scanned_at")
  })

  it('sigue aceptando el código legible de las credenciales ya impresas', () => {
    expect(body).toContain('where member_code = p_code')
    expect(body).toContain('where qr_token = v_token')
  })
})

describe('proyección de staff y rotación de credencial', () => {
  it('la proyección con documento queda reservada a service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_get_membership_by_code_or_token(text, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_get_membership_by_code_or_token(text, text)\n  to service_role;',
    )
  })

  it('agrega el documento sobre la proyección pública, sin duplicar la consulta de dominio', () => {
    const body = functionBody(
      migration,
      'create or replace function public.staff_get_membership_by_code_or_token(',
    )
    expect(body).toContain('plu_private.get_membership_by_code_or_token(p_code, p_event_slug)')
    expect(body).toContain("'{athlete,document_id}'")
  })

  it('la rotación del QR queda auditada', () => {
    const body = functionBody(
      migration,
      'create or replace function public.staff_rotate_membership_qr_token(',
    )
    expect(body).toContain("'membership.qr_rotated'")
    expect(body).toContain('qr_token = gen_random_uuid()')
  })
})

describe('comprobante de transferencia de afiliación', () => {
  const body = functionBody(
    migration,
    'create or replace function public.register_athlete_payment_proof(',
  )

  it('crea el bucket privado', () => {
    expect(migration).toContain("'athlete-payment-proofs'")
    expect(migration).toContain('public = false')
  })

  it('valida que la orden sea del atleta con sesión', () => {
    expect(body).toContain('if v_order.athlete_id <> p_athlete_id then')
  })

  it('acota la ruta al prefijo de la orden', () => {
    expect(body).toContain("p_proof_path not like (p_order_id::text || '/%')")
  })

  it('no admite comprobante sobre una orden de Mercado Pago ni ya aprobada', () => {
    expect(body).toContain("if v_order.method <> 'manual_link' then")
    expect(body).toContain("if v_order.status = 'aprobado' then")
  })
})

describe('lectura de auditoría', () => {
  it('indexa por fecha, acción y actor para el listado paginado', () => {
    expect(migration).toContain('domain_audit_logs_created_at_idx')
    expect(migration).toContain('domain_audit_logs_action_idx')
    expect(migration).toContain('domain_audit_logs_actor_idx')
  })

  it('el helper de auditoría no queda expuesto a PostgREST', () => {
    expect(migration).toContain(
      'revoke all on function plu_private.record_domain_audit(text, text, text, text, text, jsonb, uuid)\n  from public, anon, authenticated, service_role;',
    )
  })
})
