import { describe, expect, it } from 'vitest'
import { gearKind, GEAR_SETS, liftsForModality } from '../src/lib/pitbullCategories.js'

describe('liftsForModality', () => {
  it('Full Power incluye los tres levantamientos', () => {
    expect(liftsForModality('Full Power')).toEqual(['squat', 'bench', 'deadlift'])
  })

  it('Push-Pull es banco plano y peso muerto', () => {
    expect(liftsForModality('Push-Pull')).toEqual(['bench', 'deadlift'])
  })

  it('cada especialista enciende solo su levantamiento', () => {
    expect(liftsForModality('Especialista en sentadilla')).toEqual(['squat'])
    expect(liftsForModality('Especialista en banca')).toEqual(['bench'])
    expect(liftsForModality('Especialista en banco plano')).toEqual(['bench'])
    expect(liftsForModality('Especialista en peso muerto')).toEqual(['deadlift'])
  })

  it('entiende el copy en inglés', () => {
    expect(liftsForModality('Squat specialist')).toEqual(['squat'])
    expect(liftsForModality('Bench Press only')).toEqual(['bench'])
    expect(liftsForModality('Deadlift specialist')).toEqual(['deadlift'])
  })
})

describe('gearKind', () => {
  it('Raw lleva rodilleras, muñequeras y cinturón', () => {
    expect(gearKind('Raw')).toBe('raw')
    expect(GEAR_SETS[gearKind('Raw')]).toEqual(['kneeSleeves', 'wristWraps', 'belt'])
  })

  it('Raw con vendas cambia las rodilleras por vendas y mantiene el resto', () => {
    expect(gearKind('Raw con vendas')).toBe('raw-wraps')
    expect(GEAR_SETS[gearKind('Raw con vendas')]).toEqual(['kneeWraps', 'wristWraps', 'belt'])
  })

  it('el equipo de apoyo se lee por capas', () => {
    expect(gearKind('Single ply')).toBe('single')
    expect(gearKind('Multi ply')).toBe('multi')
    expect(gearKind('Sin límite')).toBe('open')
    expect(GEAR_SETS.single).toBeUndefined()
  })
})
