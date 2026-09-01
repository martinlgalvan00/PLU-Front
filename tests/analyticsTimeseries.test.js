import { describe, expect, it } from 'vitest'
import {
  buildMonthMatrix,
  calendarIntensity,
  findDayExtremes,
  monthDayKey,
} from '../src/lib/analyticsCalendar.js'

describe('findDayExtremes', () => {
  it('devuelve el dia con mas y con menos visitantes, solo entre dias con trafico', () => {
    const series = [
      { day: '2026-08-01', visitors: 0 },
      { day: '2026-08-02', visitors: 12 },
      { day: '2026-08-03', visitors: 40 },
      { day: '2026-08-04', visitors: 7 },
      { day: '2026-08-05', visitors: 0 },
    ]

    expect(findDayExtremes(series)).toEqual({
      best: { day: '2026-08-03', visitors: 40 },
      worst: { day: '2026-08-04', visitors: 7 },
    })
  })

  it('sin dias con visitas no corona ningun "peor dia" inventado', () => {
    const series = [
      { day: '2026-08-01', visitors: 0 },
      { day: '2026-08-02', visitors: 0 },
    ]

    expect(findDayExtremes(series)).toEqual({ best: null, worst: null })
    expect(findDayExtremes([])).toEqual({ best: null, worst: null })
  })

  it('con empate gana el primer dia: el registro historico establece orden', () => {
    const series = [
      { day: '2026-08-01', visitors: 10 },
      { day: '2026-08-02', visitors: 10 },
    ]

    expect(findDayExtremes(series).best.day).toBe('2026-08-01')
    expect(findDayExtremes(series).worst.day).toBe('2026-08-01')
  })
})

describe('buildMonthMatrix', () => {
  it('alinea la primera semana al lunes y rellena el borde con huecos', () => {
    // Agosto 2026 arranca sabado: 5 huecos (lun a vie previos) y 31 dias.
    const weeks = buildMonthMatrix(2026, 7)

    expect(weeks[0]).toEqual([null, null, null, null, null, 1, 2])
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks.flat().filter((day) => day !== null)).toHaveLength(31)
    expect(weeks.flat().filter((day) => day !== null).at(-1)).toBe(31)
  })

  it('febrero de 28 dias que arranca un domingo cierra con la semana del hueco final', () => {
    // Febrero 2026: domingo 1 -> 6 huecos al inicio y 1 al cierre: 5 semanas.
    const weeks = buildMonthMatrix(2026, 1)

    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1])
    expect(weeks[4]).toEqual([23, 24, 25, 26, 27, 28, null])
  })

  it('el hueco del borde tambien aparece al final para cerrar la ultima semana', () => {
    // Noviembre 2026 arranca domingo: el 30 cae lunes y la semana cierra con 6 huecos.
    const weeks = buildMonthMatrix(2026, 10)

    expect(weeks.at(-1)[0]).toBe(30)
    expect(weeks.at(-1).slice(1)).toEqual([null, null, null, null, null, null])
  })
})

describe('monthDayKey', () => {
  it('armar la clave YYYY-MM-DD con padding, sin depender de la zona horaria', () => {
    expect(monthDayKey(2026, 0, 9)).toBe('2026-01-09')
    expect(monthDayKey(2026, 11, 31)).toBe('2026-12-31')
  })
})

describe('calendarIntensity', () => {
  it('raiz cuadrada: un maximo aplastado deja respirar a los dias medios', () => {
    expect(calendarIntensity(0, 100)).toBe(0)
    expect(calendarIntensity(25, 100)).toBeCloseTo(0.5)
    expect(calendarIntensity(100, 100)).toBe(1)
  })

  it('sin maximo positivo la escala no se define', () => {
    expect(calendarIntensity(10, 0)).toBe(0)
    expect(calendarIntensity(-1, 100)).toBe(0)
  })
})
