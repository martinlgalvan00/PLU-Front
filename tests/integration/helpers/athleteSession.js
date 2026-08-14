import { randomUUID } from 'node:crypto'
import {
  ATHLETE_SESSION_COOKIE_NAME,
  createAthleteSession,
} from '../../../server/services/athleteSessionService.js'

/**
 * athleteSession.js — helpers de integración
 *
 * Espejo de staffSession.js para el otro lado del sistema: la sesión del
 * atleta (cookie plu_athlete_session) se valida contra Supabase, no contra
 * Prisma, así que acá sí hace falta la instancia real (`supabase start`).
 * El alta va directo a la tabla en vez de pasar por POST /api/athletes/register
 * para no arrastrar el envío de emails de onboarding a un test de cupos.
 */
export async function createTestAthlete(client, overrides = {}) {
  const suffix = randomUUID().slice(0, 8)
  const { data, error } = await client
    .from('athletes')
    .insert({
      full_name: `Atleta Cupo ${suffix}`,
      // 8 dígitos, sin colisionar con datos reales ni entre corridas.
      document_id: String(90_000_000 + Math.floor(Math.random() * 9_999_999)),
      email: `capacity-${suffix}@pluarg.test`,
      status: 'registrado',
      // Las inscripciones reales requieren el perfil competitivo completo.
      // Mantenerlo en el helper hace que los tests de checkout ejerciten el
      // precio y cupo, no una validación de perfil ajena al escenario.
      birth_date: '1994-05-18',
      sex: 'Masculino',
      gym: 'PLU Test Team',
      phone: '+5491100000000',
      country: 'Argentina',
      province: 'Buenos Aires',
      // Sin esto assertEmailVerified (server/routes/athletes.js) responde 403
      // y el test nunca llegaría a ejercitar el chequeo de cupo.
      email_verified_at: new Date().toISOString(),
      ...overrides,
    })
    .select('id')
    .single()

  if (error) throw new Error(`No se pudo crear el atleta de prueba: ${error.message}`)
  return data.id
}

export async function athleteSessionCookie(client, athleteId) {
  const session = await createAthleteSession({
    client,
    athleteId,
    req: { get: () => undefined, ip: '127.0.0.1' },
  })
  return `${ATHLETE_SESSION_COOKIE_NAME}=${session.token}`
}
