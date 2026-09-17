import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261125100000_checkin_scan_error_trail.sql',
  'utf8',
)

describe('migración: rastro persistido de intentos de escaneo', () => {
  it('crea la tabla con los outcomes, kind y evidencia como check cerrados', () => {
    expect(migration).toContain('create table if not exists public.checkin_scan_events')
    expect(migration).toMatch(
      /outcome text not null check \(outcome in \(\s*'checked_in', 'ready', 'already_used', 'not_ready', 'not_found',\s*'invalid', 'wrong_zone', 'not_yet_valid', 'expired', 'no_registration'/,
    )
    expect(migration).toContain("kind text not null check (kind in ('ticket', 'registration', 'unknown'))")
    expect(migration).toContain("evidence text not null check (evidence in ('server', 'operator'))")
  })

  it('nunca guarda el token crudo del QR ni PII: sólo fingerprint y FKs', () => {
    expect(migration).toContain('qr_fingerprint text')
    expect(migration).not.toMatch(/qr_token\s+uuid/)
    // attendee_dni/attendee_name sólo pueden aparecer dentro de la guarda de
    // privacidad del bloque `do $verification$`, nunca en una definición de
    // columna o un `select` que los exponga.
    const verificationBlock = migration.slice(migration.indexOf('do $verification$'))
    const bodyWithoutVerification = migration.slice(0, migration.indexOf('do $verification$'))
    expect(bodyWithoutVerification).not.toContain('attendee_dni')
    expect(bodyWithoutVerification).not.toContain('attendee_name')
    expect(verificationBlock).toContain('attendee_dni')
  })

  it('indexa por evento+fecha, evento+outcome, evento+puerta y evento+fingerprint', () => {
    expect(migration).toContain('checkin_scan_events_event_scanned_idx')
    expect(migration).toContain('checkin_scan_events_event_outcome_idx')
    expect(migration).toContain('checkin_scan_events_event_gate_idx')
    expect(migration).toContain('checkin_scan_events_event_fingerprint_idx')
    expect(migration).toContain('checkin_scan_events_device_client_idx')
  })

  it('es append-only: RLS activo y sin grant de update ni delete para ningún rol', () => {
    expect(migration).toContain('alter table public.checkin_scan_events enable row level security')
    expect(migration).toContain(
      'revoke all on public.checkin_scan_events from public, anon, authenticated',
    )
    expect(migration).toContain('grant select, insert on public.checkin_scan_events to service_role')
    expect(migration).not.toMatch(/grant update on public\.checkin_scan_events/)
    expect(migration).not.toMatch(/grant delete on public\.checkin_scan_events/)
  })

  it('suma la tabla a la purga de histórico operativo, purgando por recorded_at', () => {
    expect(migration).toContain("('checkin_scan_events',        greatest(30, coalesce(p_audit_days, 365)))")
    expect(migration).toContain(
      "unnest(array['created_at', 'received_at', 'occurred_at', 'sent_at', 'recorded_at'])",
    )
  })

  it('el informe de lectura agrega por outcome, puerta, hora y detecta QR repetidos', () => {
    expect(migration).toContain('create or replace function public.staff_get_event_scan_error_report')
    expect(migration).toContain('having count(*) >= 2 and bool_or(outcome <> ')
    expect(migration).toContain(
      "revoke all on function public.staff_get_event_scan_error_report(text, timestamptz, timestamptz, integer)",
    )
    expect(migration).toContain('grant execute on function public.staff_get_event_scan_error_report')
  })

  it('verifica al final que el informe no exponga token crudo ni DNI', () => {
    expect(migration).toContain('do $verification$')
    expect(migration).toContain("position('qr_token' in pg_get_functiondef(")
    expect(migration).toContain("position('attendee_dni' in pg_get_functiondef(")
  })
})
