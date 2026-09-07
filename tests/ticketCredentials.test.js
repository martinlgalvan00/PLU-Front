import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CREDENTIALS_PER_TYPE_MAX,
  buildTicketCredentialsPayload,
  coachTicketCredentials,
  credentialZoneScopes,
  credentialsPerPurchase,
  defaultTicketCredential,
  groupCredentialsByBundle,
  normalizeTicketCredentials,
  summarizeTicketCredentials,
  validateTicketCredentials,
} from '../src/lib/ticketCredentials.js'
import { canZoneScanCredential } from '../src/services/securityZoneService.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107100000_ticket_credential_classes.sql'),
  'utf8',
)

const publicMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261109100000_public_ticket_credentials.sql'),
  'utf8',
)

// El select del catálogo y el del cliente Supabase son dos caminos al mismo
// dato: si uno pide las credenciales y el otro no, la pantalla cambia según por
// dónde entró la lectura.
const catalogRoute = readFileSync(resolve(process.cwd(), 'server/routes/events.js'), 'utf8')
const publishedEventsSelect = readFileSync(
  resolve(process.cwd(), 'src/services/eventAdminService.js'),
  'utf8',
)

describe('credenciales por tipo de entrada', () => {
  /** Un tipo sin credenciales vendería una entrada que no abre nada. */
  it('una lista vacía cae a la credencial de siempre', () => {
    expect(normalizeTicketCredentials([])).toEqual([defaultTicketCredential()])
    expect(normalizeTicketCredentials(null)).toEqual([defaultTicketCredential()])
    expect(normalizeTicketCredentials([{ label: '  ', zoneScopes: ['gate_tickets'] }])).toEqual([
      defaultTicketCredential(),
    ])
  })

  it('descarta zonas inventadas y no las deja pasar al guardado', () => {
    const [credential] = normalizeTicketCredentials([
      { label: 'Prensa', zoneScopes: ['gate_tickets', 'zona_vip', 'staff_only'] },
    ])
    expect(credential.zoneScopes).toEqual(['gate_tickets', 'staff_only'])
  })

  it('el par del entrenador abre tribuna y entrada en calor, no la misma zona', () => {
    const [espectador, entrenador] = coachTicketCredentials()
    expect(espectador.zoneScopes).toEqual(['gate_tickets'])
    expect(entrenador.zoneScopes).toEqual(['athletes_coaches'])
    expect(credentialsPerPurchase(coachTicketCredentials())).toBe(2)
  })

  describe('validación', () => {
    it('rechaza dos credenciales con el mismo nombre', () => {
      const errors = validateTicketCredentials([
        { label: 'Espectador', zoneScopes: ['gate_tickets'] },
        { label: 'espectador', zoneScopes: ['athletes_coaches'] },
      ])
      expect(errors).toContainEqual({ index: 1, field: 'label', code: 'duplicate' })
    })

    it('rechaza una credencial sin zona: sería un QR que no abre nada', () => {
      const errors = validateTicketCredentials([{ label: 'Prensa', zoneScopes: [] }])
      expect(errors).toContainEqual({ index: 0, field: 'zoneScopes', code: 'zonesRequired' })
    })

    it('rechaza más credenciales que el tope', () => {
      const many = Array.from({ length: CREDENTIALS_PER_TYPE_MAX + 1 }, (_, i) => ({
        label: `Cred ${i}`,
        zoneScopes: ['gate_tickets'],
      }))
      expect(validateTicketCredentials(many)).toContainEqual({
        index: -1,
        field: 'list',
        code: 'tooMany',
      })
    })

    it('acepta el par del entrenador sin quejarse', () => {
      expect(validateTicketCredentials(coachTicketCredentials())).toEqual([])
    })
  })

  /**
   * Un tipo recién creado no tiene id todavía, y sus credenciales son
   * justamente las que el admin acaba de elegir: si se descartaran, habría que
   * guardar dos veces para que quedaran.
   */
  it('el payload identifica por id, y por posición cuando el tipo es nuevo', () => {
    const payload = buildTicketCredentialsPayload([
      { id: 'tt-1', sortOrder: 0, credentials: coachTicketCredentials() },
      { id: null, sortOrder: 1, credentials: [defaultTicketCredential()] },
    ])

    expect(payload).toEqual([
      { ticketTypeId: 'tt-1', credentials: coachTicketCredentials() },
      { sortOrder: 1, credentials: [defaultTicketCredential()] },
    ])
  })

  it('agrupa las credenciales de una compra y pone la primaria primero', () => {
    const [bundle] = groupCredentialsByBundle([
      { id: 't-2', bundleId: 'b-1', credentialLabel: 'ENTRENADOR', isPrimaryCredential: false },
      { id: 't-1', bundleId: 'b-1', credentialLabel: 'Espectador', isPrimaryCredential: true },
    ])
    expect(bundle.credentials.map((c) => c.credentialLabel)).toEqual(['Espectador', 'ENTRENADOR'])
  })
})

describe('la entrada en calor deja de leer afiliaciones', () => {
  /**
   * Antes `athletes_coaches` aceptaba `membership`: entraba cualquier afiliado
   * con credencial vigente y seguridad no podía distinguir a un entrenador que
   * pagó. Este test fija la regla nueva.
   */
  it('acepta inscripción y credencial de entrada, no afiliación', () => {
    expect(canZoneScanCredential('athletes_coaches', 'registration')).toBe(true)
    expect(canZoneScanCredential('athletes_coaches', 'ticket')).toBe(true)
    expect(canZoneScanCredential('athletes_coaches', 'membership')).toBe(false)
  })
})

describe('la migración sostiene las dos reglas que se pueden romper en silencio', () => {
  /**
   * Una compra de entrenador emite dos filas de `tickets`. Si el cupo contara
   * filas, habilitar entrenadores partiría el aforo al medio sin que nadie lo
   * note hasta que el evento diga "agotado" con la mitad de las entradas
   * vendidas.
   */
  it('el cupo y el aforo cuentan compras, no credenciales', () => {
    expect(migration).toContain(
      "where event_id = v_event.id and status <> 'cancelada' and is_primary_credential",
    )
    expect(migration).toContain(
      "where ticket_type_id = v_type.id and status <> 'cancelada' and is_primary_credential",
    )
  })

  /**
   * Sin validar la zona, las dos credenciales serían dos QR indistintos y toda
   * la feature sería decorativa.
   */
  it('el canje valida que la credencial habilite la zona del puesto', () => {
    expect(migration).toContain('no habilita esta zona')
    expect(migration).toContain('p_zone_scope = any(coalesce(v_ticket.credential_scopes')
  })

  /** El alcance vendido no puede cambiar porque editaron el tipo después. */
  it('la entrada emitida congela su alcance en vez de leerlo por join', () => {
    expect(migration).toContain('credential_scopes, bundle_id, is_primary_credential')
  })

  /** Mismo patrón que publicSurface y publicCopy, por el mismo motivo. */
  it('se guarda con un merge propio y no dentro del upsert de evento', () => {
    expect(migration).toContain(
      'create or replace function public.staff_merge_ticket_type_credentials',
    )
    expect(migration).not.toContain('create or replace function public.staff_upsert_event')
  })
})

describe('lo que la venta necesita saber de las credenciales', () => {
  /**
   * Una entrada de entrenador abre la puerta con una credencial y la entrada en
   * calor con la otra. Quien la está por comprar necesita ver las dos juntas.
   */
  it('las zonas del tipo son la unión de sus credenciales, sin repetir', () => {
    expect(credentialZoneScopes(coachTicketCredentials())).toEqual([
      'gate_tickets',
      'athletes_coaches',
    ])
  })

  it('mantiene el orden canónico de ZONE_SCOPES y no el de carga', () => {
    const scopes = credentialZoneScopes([
      { label: 'Calor', zoneScopes: ['athletes_coaches'] },
      { label: 'Puerta', zoneScopes: ['gate_tickets'] },
    ])
    expect(scopes).toEqual(['gate_tickets', 'athletes_coaches'])
  })

  it('sin credenciales cargadas resuelve la entrada de siempre', () => {
    expect(summarizeTicketCredentials(undefined)).toEqual({
      credentials: [defaultTicketCredential()],
      count: 1,
      zoneScopes: ['gate_tickets'],
    })
  })

  /** `count` son QR emitidos, no lugares: el cupo sigue contando compras. */
  it('cuenta las credenciales que emite la compra', () => {
    const summary = summarizeTicketCredentials(coachTicketCredentials())
    expect(summary.count).toBe(2)
    expect(summary.credentials.map((credential) => credential.label)).toEqual([
      'Espectador',
      'ENTRENADOR',
    ])
  })

  /**
   * La tabla nació con RLS y sin una sola policy: para el navegador no existía,
   * y el catálogo público mostraba dos entradas sin diferencia visible.
   */
  it('la migración de acceso público deja leer las credenciales de un evento publicado', () => {
    expect(publicMigration).toContain('create policy ticket_type_credentials_select_public_anon')
    expect(publicMigration).toContain('e.published = true')
    expect(publicMigration).toContain(
      'grant select on public.ticket_type_credentials to anon, authenticated',
    )
  })

  /** Leer no es escribir: el alta sigue siendo del panel. */
  it('la escritura pública sigue cerrada', () => {
    expect(publicMigration).toContain('ticket_type_credentials_insert_admin')
    expect(publicMigration).not.toMatch(/for insert\s+to anon/)
  })

  /**
   * El select del catálogo es el punto exacto donde las credenciales se perdían
   * antes de llegar al comprador.
   */
  it('el catálogo público pide las credenciales de cada tipo', () => {
    expect(catalogRoute).toContain('credentials:ticket_type_credentials(')
    expect(publishedEventsSelect).toContain('credentials:ticket_type_credentials(')
  })
})
