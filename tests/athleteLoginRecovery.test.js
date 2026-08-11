import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasCurrentMembership, isMembershipCurrent } from '../src/services/membershipService.js'
import { validateAthleteForm } from '../src/lib/validation.js'

/**
 * Regresiones del flujo registro → login → afiliación → inscripción.
 *
 * Los tres bugs que cubre este archivo compartían la misma forma: dos capas que
 * asumían formatos distintos del mismo dato, sin nadie que las conciliara. Son
 * verificaciones de texto sobre el SQL —igual que el resto de los tests de
 * migración del repo— más tests reales sobre los helpers del cliente.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260806120000_athlete_login_and_order_method_fix.sql',
  ),
  'utf8',
)

const yearConflictFix = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260811134322_membership_order_year_conflict_fix.sql',
  ),
  'utf8',
)

const phase2 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260715000100_phase2_rpc_functions.sql'),
  'utf8',
)

const hardening = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260716000000_infrastructure_hardening.sql'),
  'utf8',
)

const athleteRoutes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const rateLimits = readFileSync(resolve(process.cwd(), 'server/middleware/rateLimit.js'), 'utf8')
const athleteApi = readFileSync(resolve(process.cwd(), 'src/services/athleteApi.js'), 'utf8')

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('email del atleta normalizado a minúsculas', () => {
  it('la versión vieja guardaba el email crudo del formulario', () => {
    // Punto de partida del bug: `findLogin` busca por email.toLowerCase(), así
    // que cualquier alta con una mayúscula quedaba sin login ni recuperación.
    const body = functionBody(phase2, 'create or replace function public.register_athlete(p_form jsonb)')
    expect(body).toContain("p_form ->> 'email'")
    expect(body).not.toContain("lower(trim(p_form ->> 'email'))")
  })

  it('register_athlete normaliza antes de insertar', () => {
    const body = functionBody(migration, 'create or replace function public.register_athlete(p_form jsonb)')
    expect(body).toContain("lower(trim(p_form ->> 'email'))")
  })

  it('update_athlete_profile normaliza al editar el contacto', () => {
    const body = functionBody(migration, 'create or replace function public.update_athlete_profile(')
    expect(body).toContain('lower(trim(p_email))')
  })

  it('normaliza las filas ya guardadas y falla ruidosamente si colisionan', () => {
    expect(migration).toContain('set email = lower(trim(email))')
    expect(migration).toContain('having count(*) > 1')
    expect(migration).toMatch(/raise exception[\s\S]{0,120}colisionan/i)
  })

  it('los tres schemas de la API bajan el email a minúsculas', () => {
    // register, login y el PATCH de perfil: si cualquiera se saltea la
    // normalización vuelve a existir una cuenta inalcanzable.
    const normalizing = athleteRoutes.match(/z\.string\(\)\.trim\(\)\.toLowerCase\(\)\.email\(\)/g) ?? []
    expect(normalizing.length).toBeGreaterThanOrEqual(3)
    expect(athleteRoutes).not.toMatch(/email: z\.string\(\)\.trim\(\)\.email\(\)/)
  })
})

describe('documento del atleta', () => {
  it('la API acepta separadores y valida 7 u 8 dígitos', () => {
    expect(athleteRoutes).toContain(".transform((value) => value.replace(/[.\\-\\s]/g, ''))")
    expect(athleteRoutes).toContain('/^\\d{7,8}$/')
  })

  it('el cliente rechaza lo mismo que la API', () => {
    const base = {
      fullName: 'Martina Rivas',
      birthDate: '1998-04-12',
      email: 'martina@example.com',
      password: 'contrasena-larga-2026',
      phone: '1145678901',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'Banfield',
      gym: 'Maximal',
      sex: 'Femenino',
    }

    // Con puntos: se aceptaba antes y se sigue aceptando — todo DNI físico se
    // lee así y el servidor ahora los limpia con el mismo criterio.
    expect(validateAthleteForm({ ...base, documentId: '40.111.222' }).success).toBe(true)
    expect(validateAthleteForm({ ...base, documentId: '40111222' }).success).toBe(true)

    // Estos dos pasaban el wizard entero y morían con un 400 al enviar.
    expect(validateAthleteForm({ ...base, documentId: 'AB123456' }).success).toBe(false)
    expect(validateAthleteForm({ ...base, documentId: '401112' }).success).toBe(false)
  })
})

describe('reuso de orden de afiliación', () => {
  it('la versión vieja devolvía cualquier orden abierta, sin mirar el medio', () => {
    // Elegir transferencia y después Mercado Pago devolvía la orden manual: el
    // checkout embebido no se monta para ese método, así que el atleta se
    // quedaba sin forma de pagar hasta que la orden vencía (24 h).
    const body = functionBody(hardening, 'create or replace function public.create_membership_order_v2(')
    expect(body).toContain("o.status in ('pendiente', 'validacion_manual')")
    expect(body).not.toContain('o.method = p_payment_method')
  })

  it('el reuso exige el mismo medio de pago', () => {
    const body = functionBody(migration, 'create or replace function public.create_membership_order_v2(')
    expect(body).toContain('and o.method = p_payment_method')
  })

  it('cancela la orden abierta del medio anterior', () => {
    const body = functionBody(migration, 'create or replace function public.create_membership_order_v2(')
    expect(body).toContain("set status = 'cancelado'")
    expect(body).toContain('o.method <> p_payment_method')
  })

  it('reusa la afiliación impaga en vez de abrir una del año siguiente', () => {
    // Verificado contra Postgres: sin esto, cambiar de medio calculaba el
    // período desde el vencimiento de una afiliación que todavía no se cobró y
    // dejaba al atleta con dos (2026 pendiente + 2027 pendiente).
    const body = functionBody(migration, 'create or replace function public.create_membership_order_v2(')
    expect(body).toContain("and m.status = 'pendiente_pago'")
    expect(body).toContain('if v_pending.id is not null then')
    // La renovación se sigue calculando sobre el último período cobrado.
    expect(body).toContain("m.status <> 'pendiente_pago'")
  })

  it('repunta la afiliación reusada a la orden viva', () => {
    // Si quedaba apuntando a la orden que se acaba de cancelar, Finanzas no
    // podía aprobarla.
    const body = functionBody(migration, 'create or replace function public.create_membership_order_v2(')
    expect(body).toMatch(/update public\.memberships\s+set payment_order_id = v_order\.id/)
  })
})

describe('conflicto athlete_id + year al crear orden de afiliación', () => {
  const body = functionBody(
    yearConflictFix,
    'create or replace function public.create_membership_order_v2(',
  )

  it('reusa cualquier afiliación pendiente, no solo la del mismo plan', () => {
    // Cambiar anual ↔ automática dejaba la fila del año ocupada y el INSERT
    // siguiente explotaba con memberships_athlete_id_year_key.
    expect(body).toContain("m.status = 'pendiente_pago'")
    expect(body).toContain('m.plan_id is not distinct from v_plan.id')
    expect(body).not.toMatch(
      /where m\.athlete_id = p_athlete_id and m\.plan_id = v_plan\.id and m\.status = 'pendiente_pago'/,
    )
  })

  it('actualiza la fila del mismo año en vez de insertar otra', () => {
    expect(body).toContain('v_same_year')
    expect(body).toContain('and m.year = v_year')
    expect(body).toContain("status = 'pendiente_pago'")
    expect(body).toContain('when unique_violation then')
  })

  it('no pisa una afiliación vigente o programada del mismo año', () => {
    expect(body).toContain('PLU13')
    expect(body).toContain('afiliacion vigente')
    expect(body).toContain('afiliacion programada')
  })

  it('al reusar una orden abierta devuelve la membership vinculada, no la última cobrada', () => {
    // Antes devolvía v_existing aunque la orden apuntara a la pendiente.
    expect(body).toContain('coalesce(v_membership, v_pending, v_existing)')
  })
})

describe('rate limit del login de atleta', () => {
  it('tiene instancia propia, separada de la del login de staff', () => {
    // Compartir `authLimiter` hacía que cada intento gastara dos cupos: el
    // cliente prueba el login de staff primero y cae al de atleta ante el 401.
    expect(rateLimits).toContain('export const athleteAuthLimiter')
    expect(athleteRoutes).toContain("router.post('/login', athleteAuthLimiter")
    expect(athleteRoutes).not.toContain('authLimiter,')
  })
})

describe('alta de atleta', () => {
  it('reserva los mails de onboarding antes de responder', () => {
    // El dispatcher persiste el outbox antes de contactar a Brevo. Esperarlo
    // evita que una función serverless termine sin envío ni reintento durable;
    // el best-effort mantiene exitoso el alta aunque el proveedor esté caído.
    const handler = athleteRoutes.slice(
      athleteRoutes.indexOf("router.post('/register'"),
      athleteRoutes.indexOf("router.post('/verify-email'"),
    )
    const respondsAt = handler.indexOf('res.status(201).json')
    const sendsAt = handler.indexOf('sendOnboardingEmails(row)')
    expect(respondsAt).toBeGreaterThan(-1)
    expect(sendsAt).toBeGreaterThan(-1)
    expect(respondsAt).toBeGreaterThan(sendsAt)
    expect(athleteRoutes).not.toContain("sendBestEffort('welcome'")
    expect(athleteRoutes).toContain('sendVerificationEmail(row)')
    expect(athleteRoutes).toContain('verificationCode')
    expect(athleteRoutes).toContain("'/me/verify-email-code'")
  })

  it('expone check de disponibilidad y marca ATHLETE_EXISTS con campos', () => {
    expect(athleteRoutes).toContain("'/check-availability'")
    expect(athleteRoutes).toContain("code: 'ATHLETE_EXISTS'")
    expect(athleteRoutes).toContain('checkAvailability')
    expect(athleteApi).toContain('checkAthleteAvailability')
  })
})

describe('vigencia de la afiliación en el cliente', () => {
  const today = new Date('2026-08-06T12:00:00')

  it('una afiliación activa y en fecha habilita la inscripción', () => {
    expect(
      isMembershipCurrent(
        { status: 'activa', startDate: '2026-01-01', expirationDate: '2027-01-31' },
        today,
      ),
    ).toBe(true)
  })

  it('una activa pero vencida no alcanza', () => {
    // Misma vigencia que exige el check-in cuando el evento pide afiliación.
    expect(
      isMembershipCurrent(
        { status: 'activa', startDate: '2025-01-01', expirationDate: '2026-01-31' },
        today,
      ),
    ).toBe(false)
  })

  it('una activa que todavía no empezó tampoco', () => {
    expect(
      isMembershipCurrent(
        { status: 'activa', startDate: '2026-12-01', expirationDate: '2027-12-01' },
        today,
      ),
    ).toBe(false)
  })

  it('sin fecha de vencimiento no habilita, igual que en la base', () => {
    expect(isMembershipCurrent({ status: 'activa', startDate: '2026-01-01' }, today)).toBe(false)
  })

  it('pendiente_pago nunca habilita', () => {
    expect(
      isMembershipCurrent(
        { status: 'pendiente_pago', startDate: '2026-01-01', expirationDate: '2027-01-31' },
        today,
      ),
    ).toBe(false)
  })

  it('hasCurrentMembership resuelve por atleta', () => {
    const memberships = [
      { athleteId: 'ath-001', status: 'activa', startDate: '2026-01-01', expirationDate: '2027-01-31' },
      { athleteId: 'ath-002', status: 'activa', startDate: '2024-01-01', expirationDate: '2025-01-31' },
    ]
    expect(hasCurrentMembership(memberships, 'ath-001', today)).toBe(true)
    expect(hasCurrentMembership(memberships, 'ath-002', today)).toBe(false)
    expect(hasCurrentMembership(memberships, undefined, today)).toBe(false)
  })
})
