import { describe, expect, it } from 'vitest'
import {
  EVENT_OFFERING_CATEGORIES,
  EVENT_OFFERING_DIVISIONS,
  EVENT_OFFERING_MODALITIES,
  isDefaultOffering,
  normalizeEventOffering,
  offeringFromRules,
  offeringForStorage,
  validateSelectionAgainstOffering,
} from '../shared/eventOffering.js'

describe('normalizeEventOffering', () => {
  it('sin configuración ofrece todo', () => {
    for (const raw of [undefined, null, {}, 'x', []]) {
      expect(normalizeEventOffering(raw)).toEqual({
        categories: [...EVENT_OFFERING_CATEGORIES],
        divisions: [...EVENT_OFFERING_DIVISIONS],
        modalities: [...EVENT_OFFERING_MODALITIES],
      })
    }
  })

  it('conserva un subconjunto, en orden canónico y sin repetidos', () => {
    const offering = normalizeEventOffering({
      categories: ['Single-Ply', 'Raw', 'Raw', 'Fantasía'],
      modalities: ['bench', 'full_power'],
    })
    expect(offering.categories).toEqual(['Raw', 'Single-Ply'])
    expect(offering.modalities).toEqual(['full_power', 'bench'])
    expect(offering.divisions).toEqual([...EVENT_OFFERING_DIVISIONS])
  })

  it('una lista vacía o toda inválida vuelve a ofrecer todo: un evento no puede quedar sin nada', () => {
    expect(normalizeEventOffering({ categories: [] }).categories).toEqual([...EVENT_OFFERING_CATEGORIES])
    expect(normalizeEventOffering({ modalities: ['rumba'] }).modalities).toEqual([
      ...EVENT_OFFERING_MODALITIES,
    ])
  })

  it('Open siempre se ofrece: todos pueden anotarse en Open', () => {
    expect(normalizeEventOffering({ divisions: ['Junior'] }).divisions).toEqual(['Junior', 'Open'].sort(
      (a, b) => EVENT_OFFERING_DIVISIONS.indexOf(a) - EVENT_OFFERING_DIVISIONS.indexOf(b),
    ))
    expect(normalizeEventOffering({ divisions: ['Masters'] }).divisions).toContain('Open')
  })
})

describe('offeringFromRules / offeringForStorage', () => {
  it('lee rules.offering', () => {
    expect(offeringFromRules({ offering: { categories: ['Raw'] } }).categories).toEqual(['Raw'])
    expect(offeringFromRules(null).categories).toEqual([...EVENT_OFFERING_CATEGORIES])
  })

  it('guarda solo lo que se aparta de "todo": lo nuevo del catálogo se ofrece por defecto', () => {
    expect(offeringForStorage(normalizeEventOffering({}))).toEqual({})
    expect(offeringForStorage(normalizeEventOffering({ categories: ['Raw'] }))).toEqual({
      categories: ['Raw'],
    })
  })

  it('isDefaultOffering distingue lo personalizado', () => {
    expect(isDefaultOffering(normalizeEventOffering({}))).toBe(true)
    expect(isDefaultOffering(normalizeEventOffering({ modalities: ['full_power'] }))).toBe(false)
  })
})

describe('validateSelectionAgainstOffering', () => {
  const offering = normalizeEventOffering({
    categories: ['Raw'],
    divisions: ['Junior', 'Open'],
    modalities: ['full_power', 'bench'],
  })
  const ok = { category: 'Raw', division: 'Junior', secondaryDivision: 'Open', modalities: ['full_power', 'bench'] }

  it('acepta lo que el evento ofrece', () => {
    expect(validateSelectionAgainstOffering(ok, offering)).toEqual({ ok: true })
  })

  it('rechaza una categoría que el evento no ofrece', () => {
    expect(validateSelectionAgainstOffering({ ...ok, category: 'Single-Ply' }, offering)).toMatchObject({
      ok: false,
      code: 'OFFERING_CATEGORY_UNAVAILABLE',
    })
  })

  it('rechaza una división que el evento no ofrece', () => {
    expect(validateSelectionAgainstOffering({ ...ok, division: 'Masters' }, offering)).toMatchObject({
      ok: false,
      code: 'OFFERING_DIVISION_UNAVAILABLE',
    })
  })

  it('rechaza una modalidad que el evento no ofrece', () => {
    expect(validateSelectionAgainstOffering({ ...ok, modalities: ['squat'] }, offering)).toMatchObject({
      ok: false,
      code: 'OFFERING_MODALITY_UNAVAILABLE',
    })
  })

  it('sin configuración todo es válido', () => {
    expect(validateSelectionAgainstOffering(ok, normalizeEventOffering({}))).toEqual({ ok: true })
  })
})

describe('migración staff_merge_event_offering', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync('supabase/migrations/20261228130000_event_offering.sql', 'utf8')

  it('guarda en rules.offering y lo quita cuando no queda nada que restringir', () => {
    expect(sql).toContain("'{offering}'")
    expect(sql).toContain("- 'offering'")
  })

  it('el catálogo de la base es el mismo que el de la API', () => {
    for (const value of [
      ...EVENT_OFFERING_CATEGORIES,
      ...EVENT_OFFERING_DIVISIONS,
      ...EVENT_OFFERING_MODALITIES,
    ]) {
      expect(sql, value).toContain(`'${value}'`)
    }
  })

  it('no deja apagar Open ni guardar listas vacías o fuera de catálogo', () => {
    expect(sql).toContain("not ('Open' = any (v_values))")
    expect(sql).toContain('cardinality(v_values) = 0')
    expect(sql).toContain('not (v_values <@ v_catalog)')
  })

  it('solo la ejecuta service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.staff_merge_event_offering\(text, jsonb\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_merge_event_offering\(text, jsonb\)\s+to service_role/,
    )
  })
})
