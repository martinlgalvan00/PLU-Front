import { describe, expect, it } from 'vitest'
import {
  EXTERNAL_FORM_LABEL_MAX,
  externalFormFromRules,
  normalizeExternalForm,
  normalizeExternalFormUrl,
} from '../src/lib/eventExternalForm.js'

describe('normalizeExternalFormUrl', () => {
  it.each([
    ['https://forms.gle/AbC123xyz', 'https://forms.gle/AbC123xyz'],
    ['  https://forms.gle/AbC123xyz  ', 'https://forms.gle/AbC123xyz'],
    [
      'https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link',
      'https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link',
    ],
    ['https://docs.google.com/forms/d/1abc/edit', 'https://docs.google.com/forms/d/1abc/edit'],
    ['https://forms.google.com/forms/d/1abc/viewform', 'https://forms.google.com/forms/d/1abc/viewform'],
  ])('acepta %s', (input, expected) => {
    expect(normalizeExternalFormUrl(input)).toEqual({ ok: true, url: expected })
  })

  it('vacío es válido y significa sin formulario', () => {
    expect(normalizeExternalFormUrl('')).toEqual({ ok: true, url: '' })
    expect(normalizeExternalFormUrl(null)).toEqual({ ok: true, url: '' })
    expect(normalizeExternalFormUrl('   ')).toEqual({ ok: true, url: '' })
  })

  it.each([
    ['http://forms.gle/AbC123xyz', 'insecure'],
    ['javascript:alert(1)', 'invalid'],
    ['data:text/html,<script>1</script>', 'invalid'],
    ['https://evil.example/forms.gle/abc', 'host'],
    ['https://forms.gle.evil.example/abc', 'host'],
    ['https://docs.google.com/document/d/1abc/edit', 'host'],
    ['https://docs.google.com/spreadsheets/d/1abc', 'host'],
    ['https://forms.gle/', 'invalid'],
    ['no es una url', 'invalid'],
    ['https://user:pass@forms.gle/AbC123', 'invalid'],
  ])('rechaza %s', (input, reason) => {
    const result = normalizeExternalFormUrl(input)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe(reason)
  })

  it('rechaza una URL de más de 500 caracteres', () => {
    const result = normalizeExternalFormUrl(`https://forms.gle/${'a'.repeat(500)}`)
    expect(result).toMatchObject({ ok: false, reason: 'too_long' })
  })
})

describe('normalizeExternalForm', () => {
  it('recorta la etiqueta y descarta todo si no hay URL', () => {
    expect(normalizeExternalForm({ url: '', label: 'Encuesta' })).toEqual({ url: '', label: '' })
    expect(normalizeExternalForm(undefined)).toEqual({ url: '', label: '' })
  })

  it('conserva URL válida y etiqueta acotada', () => {
    const form = normalizeExternalForm({
      url: 'https://forms.gle/AbC123xyz',
      label: `  ${'x'.repeat(EXTERNAL_FORM_LABEL_MAX + 10)}  `,
    })
    expect(form.url).toBe('https://forms.gle/AbC123xyz')
    expect(form.label).toHaveLength(EXTERNAL_FORM_LABEL_MAX)
  })

  it('una URL inválida se descarta en vez de publicarse', () => {
    expect(normalizeExternalForm({ url: 'javascript:alert(1)', label: 'x' })).toEqual({
      url: '',
      label: '',
    })
  })
})

describe('externalFormFromRules', () => {
  it('lee rules.externalForm y normaliza', () => {
    expect(
      externalFormFromRules({ externalForm: { url: 'https://forms.gle/AbC123xyz', label: 'Encuesta' } }),
    ).toEqual({ url: 'https://forms.gle/AbC123xyz', label: 'Encuesta' })
  })

  it('sin rules devuelve vacío', () => {
    expect(externalFormFromRules(null)).toEqual({ url: '', label: '' })
    expect(externalFormFromRules({})).toEqual({ url: '', label: '' })
  })
})

describe('migración staff_merge_event_external_form', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync('supabase/migrations/20261228120000_event_external_form.sql', 'utf8')

  it('guarda en rules.externalForm y lo quita cuando la URL viene vacía', () => {
    expect(sql).toContain("'{externalForm}'")
    expect(sql).toContain("- 'externalForm'")
  })

  it('repite la regla de la API: https y solo dominios de Google Forms', () => {
    expect(sql).toContain('^https://')
    expect(sql).toContain('forms\\.gle/')
    expect(sql).toContain('(docs|forms)\\.google\\.com/')
    expect(sql).toContain('length(v_url) > 500')
  })

  it('solo la ejecuta service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.staff_merge_event_external_form\(text, text, text\)\s+from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.staff_merge_event_external_form\(text, text, text\)\s+to service_role/,
    )
  })

  it('la regex de la base acepta y rechaza lo mismo que el helper', () => {
    const regex =
      /^https:\/\/(forms\.gle\/[^\s/@]+[^\s@]*|(docs|forms)\.google\.com\/([a-z]\/[^/\s@]+\/)?forms\/[^\s@]+)$/i
    const urls = [
      'https://forms.gle/AbC123xyz',
      'https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform?usp=sf_link',
      'https://docs.google.com/forms/d/1abc/edit',
      'https://forms.google.com/forms/d/1abc/viewform',
      'http://forms.gle/AbC123xyz',
      'https://evil.example/forms.gle/abc',
      'https://forms.gle.evil.example/abc',
      'https://docs.google.com/document/d/1abc/edit',
      'https://forms.gle/',
      'https://user:pass@forms.gle/AbC123',
      'javascript:alert(1)',
    ]
    for (const url of urls) {
      expect(regex.test(url), url).toBe(normalizeExternalFormUrl(url).ok)
    }
  })
})

describe('formulario externo en el servicio de eventos', async () => {
  const { buildAdminEventDraft, mapSupabaseEventRow, createAdminEventDraft } = await import(
    '../src/services/eventAdminService.js'
  )

  const row = {
    id: 'evt-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    venue: 'Sede',
    location: 'CABA',
    starts_at: '2026-08-15T12:00:00.000Z',
    ends_at: '2026-08-15T23:00:00.000Z',
    status: 'inscripcion_abierta',
    published: true,
    capacity: 120,
    price: 75000,
    currency: 'ARS',
    rules: { externalForm: { url: 'https://forms.gle/AbC123xyz', label: 'Encuesta' } },
  }

  it('lee rules.externalForm de la fila', () => {
    expect(mapSupabaseEventRow(row).externalForm).toEqual({
      url: 'https://forms.gle/AbC123xyz',
      label: 'Encuesta',
    })
  })

  it('una fila sin formulario, o con una URL inválida, queda vacía', () => {
    expect(mapSupabaseEventRow({ ...row, rules: {} }).externalForm).toEqual({ url: '', label: '' })
    expect(
      mapSupabaseEventRow({
        ...row,
        rules: { externalForm: { url: 'https://evil.example/x', label: 'x' } },
      }).externalForm,
    ).toEqual({ url: '', label: '' })
  })

  it('el borrador lo conserva y el borrador nuevo arranca vacío', () => {
    const draft = buildAdminEventDraft(mapSupabaseEventRow(row))
    expect(draft.externalForm).toEqual({ url: 'https://forms.gle/AbC123xyz', label: 'Encuesta' })
    expect(createAdminEventDraft().externalForm).toEqual({ url: '', label: '' })
  })
})
