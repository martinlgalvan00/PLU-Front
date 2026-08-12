import { describe, expect, it } from 'vitest'
import { searchPublishedLifters } from '../src/services/lifterLookupService.js'

describe('lifterLookupService', () => {
  it('no busca con menos de 2 caracteres', () => {
    expect(searchPublishedLifters('')).toEqual([])
    expect(searchPublishedLifters('n')).toEqual([])
  })

  it('encuentra atletas en planillas publicadas', () => {
    const matches = searchPublishedLifters('Nicolás')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].name.toLowerCase()).toContain('nicolás')
    expect(matches[0].meetSlug).toBe('spring-classic-2025')
  })
})
