import { describe, expect, it } from 'vitest'
import es from '../src/data/rulebook/es.json'
import {
  MEN_WEIGHT_CLASSES,
  WOMEN_WEIGHT_CLASSES,
  canonicalDeclaredWeightClass,
  isDeclaredWeightClassForSex,
} from '../shared/pluWeightClasses.js'

describe('clases de peso PLU', () => {
  it('coincide con las etiquetas del reglamento', () => {
    const women = es.weightClasses.find((group) => group.id === 'women-n')
    const men = es.weightClasses.find((group) => group.id === 'men')
    expect(women.classes.map((item) => item.label)).toEqual([...WOMEN_WEIGHT_CLASSES])
    expect(men.classes.map((item) => item.label)).toEqual([...MEN_WEIGHT_CLASSES])
  })

  it('normaliza el decimal sin perder la clase', () => {
    expect(canonicalDeclaredWeightClass('67.5')).toBe('67,5')
    expect(canonicalDeclaredWeightClass('67,50 kg')).toBe('67,5')
    expect(canonicalDeclaredWeightClass('140+')).toBe('140+')
    expect(canonicalDeclaredWeightClass('99')).toBe('')
  })

  it('no mezcla clases de mujer en un hombre', () => {
    expect(isDeclaredWeightClassForSex('Masculino', '90')).toBe(true)
    expect(isDeclaredWeightClassForSex('Masculino', '44')).toBe(false)
    expect(isDeclaredWeightClassForSex('Femenino', '44')).toBe(true)
    expect(isDeclaredWeightClassForSex('Femenino', '')).toBe(false)
  })
})
