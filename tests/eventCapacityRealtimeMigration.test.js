import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260817130000_event_capacity_realtime.sql'),
  'utf8',
)

describe('migración de cupos en tiempo real', () => {
  it('emite sólo el slug del evento y autoriza exclusivamente su tópico público', () => {
    expect(migration).toContain("jsonb_build_object('eventSlug', v_event_slug)")
    expect(migration).toContain("'event-capacity:' || v_event_slug")
    expect(migration).toContain("realtime.topic() like 'event-capacity:%'")
    expect(migration).not.toContain('athlete_id')
  })
})
