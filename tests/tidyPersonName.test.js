import { describe, expect, it } from 'vitest'
import { tidyPersonName } from '../src/lib/format.js'

describe('tidyPersonName', () => {
  it('capitaliza las palabras tipeadas en minúscula', () => {
    expect(tidyPersonName('Martinez santos julian')).toBe('Martinez Santos Julian')
    expect(tidyPersonName('juan perez')).toBe('Juan Perez')
  })

  it('respeta las partículas del nombre', () => {
    expect(tidyPersonName('Tomás Aguirre Fernández de la Vega')).toBe(
      'Tomás Aguirre Fernández de la Vega',
    )
    expect(tidyPersonName('ana de los santos')).toBe('Ana de los Santos')
  })

  it('no toca lo que ya viene bien escrito ni los nombres en mayúsculas', () => {
    expect(tidyPersonName('Evelin Daiana Bebitez')).toBe('Evelin Daiana Bebitez')
    expect(tidyPersonName('MARÍA DE LOS ÁNGELES')).toBe('MARÍA DE LOS ÁNGELES')
    expect(tidyPersonName('')).toBe('')
  })
})
