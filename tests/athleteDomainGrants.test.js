import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * athleteDomainGrants.test.js — PLU ARG
 *
 * Quién puede ejecutar las RPC que proyectan el padrón, medido sobre la cadena
 * COMPLETA de migraciones y no sobre un archivo suelto.
 *
 * `infrastructureHardening.test.js` ya verificaba que
 * `20260716000000_infrastructure_hardening.sql` revocara
 * `get_athlete_snapshot` de anon/authenticated. Esa aserción siguió en verde
 * mientras `20260806230000_event_registration_schedule.sql`, tres semanas más
 * tarde, volvía a otorgarla: un test anclado a un archivo no puede ver lo que
 * hace el siguiente. Con la anon key en el bundle, eso dejaba
 * `list_athlete_admin_data()` (el padrón entero) al alcance de cualquiera que
 * se registrara, y `get_athlete_snapshot(uuid)` — que devuelve el
 * `credential_token`, o sea el QR — al alcance de anon.
 *
 * Este test reconstruye el estado final aplicando las migraciones en orden,
 * que es lo que efectivamente corre en la base.
 */

const MIGRATIONS_DIR = path.resolve('supabase/migrations')

/**
 * Los cuerpos `$$ ... $$` traen sus propios `;` y comentarios: se descartan
 * antes de partir en sentencias, si no cada función parte el archivo en
 * pedazos que no son SQL de nivel superior.
 */
function statementsOf(sql) {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, ' _body_ ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

/** `public.foo( uuid , text )` y `public.foo(uuid,text)` son la misma función. */
function normalizeSignature(signature) {
  return signature
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
}

function rolesOf(list) {
  return list
    .toLowerCase()
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

/**
 * Rol → funciones que puede ejecutar, tras aplicar cada `grant`/`revoke` en el
 * orden en que corren las migraciones.
 */
function effectiveExecutors() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const executors = new Map()

  const grantOf = (statement) =>
    /^grant execute on (?:function|routine) (.+?) to (.+)$/i.exec(statement)
  const revokeOf = (statement) =>
    /^revoke (?:all|execute)(?: privileges)? on (?:function|routine) (.+?) from (.+)$/i.exec(
      statement,
    )

  for (const file of files) {
    for (const statement of statementsOf(
      fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    )) {
      const granted = grantOf(statement)
      if (granted) {
        const signature = normalizeSignature(granted[1])
        for (const role of rolesOf(granted[2])) {
          if (!executors.has(role)) executors.set(role, new Set())
          executors.get(role).add(signature)
        }
        continue
      }

      const revoked = revokeOf(statement)
      if (!revoked) continue
      const signature = normalizeSignature(revoked[1])
      for (const role of rolesOf(revoked[2])) {
        executors.get(role)?.delete(signature)
      }
    }
  }

  return executors
}

// Proyecciones del padrón: devuelven documento, correo, teléfono y el
// `credential_token` al que apunta el QR. Se llaman desde Express con la
// service key, detrás de la cookie de atleta o de los guards del panel.
const SERVICE_ROLE_ONLY = [
  'public.get_athlete_snapshot(uuid)',
  'public.list_athlete_admin_data()',
  'public.create_membership_order_v3(uuid,text,text,text)',
  'public.approve_athlete_payment_order(uuid,text,text)',
  'public.apply_mercado_pago_payment(uuid,text,text,int,text,text,text,jsonb)',
  'public.staff_get_membership_by_code_or_token(text,text)',
]

describe('privilegios efectivos sobre el dominio de atletas', () => {
  const executors = effectiveExecutors()

  it.each(SERVICE_ROLE_ONLY)('%s no queda al alcance del browser', (signature) => {
    // La anon key viaja en el bundle y el signup de Supabase Auth está
    // abierto: `anon` y `authenticated` son, en la práctica, cualquiera.
    expect(executors.get('anon') ?? new Set()).not.toContain(signature)
    expect(executors.get('authenticated') ?? new Set()).not.toContain(signature)
    expect(executors.get('public') ?? new Set()).not.toContain(signature)
  })

  it('deja a service_role ejecutar lo que Express necesita', () => {
    for (const signature of SERVICE_ROLE_ONLY) {
      expect(executors.get('service_role') ?? new Set()).toContain(signature)
    }
  })

  it('mantiene pública la verificación de credencial, que se escanea sin sesión', () => {
    // La contracara: la puerta escanea un QR desde un teléfono sin cuenta. La
    // proyección vive en `plu_private` y devuelve PII solo contra token.
    const signature = 'plu_private.get_membership_by_code_or_token(text,text)'
    expect(executors.get('anon') ?? new Set()).toContain(signature)
  })
})
