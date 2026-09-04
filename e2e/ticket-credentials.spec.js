import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { FIXTURE_PATH } from './global-setup.js'
import { resolveLocalSupabase } from './local-supabase.js'

/**
 * Flujo de ingreso al evento — PLU ARG
 *
 * Cubre lo que pasa DESPUÉS de la compra: qué credenciales emite y qué abre
 * cada una. Es el tramo donde un error no se ve hasta el día del meet, con la
 * gente en la puerta.
 *
 * La compra se hace contra `create_ticket_order_v2`, que es la MISMA función
 * que llama el servidor cuando alguien compra desde la web -- no un atajo de
 * test. El formulario público tiene su propio spec (`ticket-purchase.spec.js`),
 * hoy bloqueado porque la página no llega a ofrecer las entradas en el entorno
 * E2E; ese hueco está anotado ahí y es independiente de esto.
 *
 * Las tres reglas que se verifican son las que se rompen en silencio:
 *   1. una compra de entrenador emite DOS credenciales, con un QR cada una;
 *   2. el cupo cuenta COMPRAS, no credenciales (si contara filas, habilitar
 *      entrenadores partiría el aforo al medio);
 *   3. cada credencial abre sólo su zona, y una sola vez.
 */

let fixture
let admin

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  const supabase = resolveLocalSupabase()
  admin = createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

/** Compra una entrada, por el mismo camino que usa el servidor. */
async function comprarEntrada({ fullName, dni, ticketTypeId, idempotencyKey }) {
  const { data, error } = await admin.rpc('create_ticket_order_v2', {
    p_event_slug: fixture.ticketEventSlug,
    p_attendees: [{ fullName, dni, ticketTypeId }],
    p_buyer: { name: fullName, email: `${dni}@e2e.test`, provider: 'mercado_pago' },
    p_idempotency_key: idempotencyKey,
    // Único por compra: `ticket_orders.access_token_hash` tiene índice único,
    // y es el token con el que el comprador vuelve a su orden.
    p_access_token_hash: createHash('sha256').update(idempotencyKey).digest('hex'),
  })
  if (error) throw new Error(error.message)
  return data
}

/** Credenciales emitidas para un DNI, en el orden en que se emiten. */
async function credentialsForDni(dni) {
  const { data, error } = await admin
    .from('tickets')
    .select('id, qr_token, credential_label, credential_scopes, bundle_id, is_primary_credential, unit_price, status')
    .eq('event_id', fixture.ticketEventId)
    .eq('attendee_dni', dni)
    .order('is_primary_credential', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

test.describe('Credenciales de ingreso', () => {
  test('una compra de entrenador emite dos credenciales y ocupa un solo lugar', async () => {
    const dni = '30111222'
    await comprarEntrada({
      fullName: 'Coach Credenciales',
      dni,
      ticketTypeId: fixture.coachTypeId,
      idempotencyKey: `e2e-coach-${fixture.run}-01`,
    })

    const credentials = await credentialsForDni(dni)

    // Dos credenciales, no dos compras: mismo bundle.
    expect(credentials).toHaveLength(2)
    expect(new Set(credentials.map((c) => c.bundle_id)).size).toBe(1)
    expect(credentials.map((c) => c.credential_label)).toEqual(['Espectador', 'ENTRENADOR'])

    // Cada una con su QR: son dos canjes distintos en dos puestos distintos.
    expect(new Set(credentials.map((c) => c.qr_token)).size).toBe(2)

    // La segunda va en 0: ya está paga dentro de la misma compra, y contarla
    // de nuevo inflaría la recaudación del evento.
    const [espectador, entrenador] = credentials
    expect(espectador.is_primary_credential).toBe(true)
    expect(espectador.unit_price).toBe(10000)
    expect(entrenador.is_primary_credential).toBe(false)
    expect(entrenador.unit_price).toBe(0)

    // Y cada una abre lo suyo.
    expect(espectador.credential_scopes).toEqual(['gate_tickets'])
    expect(entrenador.credential_scopes).toEqual(['athletes_coaches'])
  })

  test('el cupo cuenta compras y no credenciales', async () => {
    const { count: filas } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_type_id', fixture.coachTypeId)
      .neq('status', 'cancelada')

    const { count: consumido } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_type_id', fixture.coachTypeId)
      .eq('is_primary_credential', true)
      .neq('status', 'cancelada')

    // Es la regla: el doble de filas que de lugares ocupados. Si esto se
    // igualara, el aforo del evento estaría contando el doble.
    expect(filas).toBe(consumido * 2)
  })

  test('cada credencial abre sólo su zona, y una sola vez', async () => {
    const dni = '30111222'
    const credentials = await credentialsForDni(dni)
    const espectador = credentials.find((c) => c.credential_label === 'Espectador')
    const entrenador = credentials.find((c) => c.credential_label === 'ENTRENADOR')

    // El canje exige pago acreditado; la orden quedó en transferencia pendiente.
    const { error: payError } = await admin
      .from('tickets')
      .update({ status: 'pagada' })
      .in('id', [espectador.id, entrenador.id])
    expect(payError).toBeNull()

    // 1. La de ENTRENADOR abre la entrada en calor.
    const ok = await admin.rpc('staff_check_in_ticket', {
      p_qr_token: entrenador.qr_token,
      p_gate: 'Calentamiento',
      p_actor: 'e2e',
      p_zone_scope: 'athletes_coaches',
    })
    expect(ok.error).toBeNull()
    expect(ok.data.ticket.credential_label).toBe('ENTRENADOR')

    // 2. La misma credencial dos veces, no. Es lo que evita que una entrada
    //    circule entre varias personas en la puerta.
    const repetida = await admin.rpc('staff_check_in_ticket', {
      p_qr_token: entrenador.qr_token,
      p_gate: 'Calentamiento',
      p_actor: 'e2e',
      p_zone_scope: 'athletes_coaches',
    })
    expect(repetida.error?.message).toMatch(/ya fue utilizada/i)

    // 3. La de espectador NO abre la entrada en calor: es el punto de tener
    //    dos credenciales en vez de una.
    const zonaEquivocada = await admin.rpc('staff_check_in_ticket', {
      p_qr_token: espectador.qr_token,
      p_gate: 'Calentamiento',
      p_actor: 'e2e',
      p_zone_scope: 'athletes_coaches',
    })
    expect(zonaEquivocada.error?.message).toMatch(/no habilita esta zona/i)

    // 4. Pero sí abre la puerta principal, que es lo que se le vendió.
    const puerta = await admin.rpc('staff_check_in_ticket', {
      p_qr_token: espectador.qr_token,
      p_gate: 'Puerta principal',
      p_actor: 'e2e',
      p_zone_scope: 'gate_tickets',
    })
    expect(puerta.error).toBeNull()
    expect(puerta.data.ticket.credential_label).toBe('Espectador')
  })

  test('una entrada de público general emite una sola credencial', async () => {
    const dni = '30111999'
    await comprarEntrada({
      fullName: 'Publico Simple',
      dni,
      ticketTypeId: fixture.generalTypeId,
      idempotencyKey: `e2e-general-${fixture.run}-01`,
    })

    const credentials = await credentialsForDni(dni)
    expect(credentials).toHaveLength(1)
    expect(credentials[0].credential_label).toBe('Entrada general')
    expect(credentials[0].is_primary_credential).toBe(true)
  })
})
