import { describe, expect, it } from 'vitest'
import {
  buildRecordsCsv,
  buildRecordsRegister,
  buildRecordsRegisterFromMeets,
  filterRecordsRegister,
  groupRecordsFederated,
} from '../src/services/recordsService.js'

const t = (key) => key

describe('recordsService', () => {
  it('el padrón público está vacío (sin mockear fixtures)', () => {
    const register = buildRecordsRegister()
    expect(register.entries).toEqual([])
    expect(register.meetCount).toBe(0)
    expect(register.sourceMeets).toEqual([])
  })

  it('deriva marcas solo desde meets publicados (helper)', () => {
    const register = buildRecordsRegisterFromMeets()
    expect(register.meetCount).toBeGreaterThan(0)
    expect(register.entries.length).toBeGreaterThan(0)
    expect(register.sourceMeets).toContain('Spring Classic 2025')

    const squatOpenMen83 = register.entries.find((entry) => (
      entry.lift === 'squat'
      && entry.sex === 'men'
      && entry.group === 'open'
      && entry.weightClass === '-83 kg'
    ))
    expect(squatOpenMen83).toMatchObject({
      athlete: 'Nicolás Aguirre',
      mark: 210,
      meet: 'Spring Classic 2025',
    })
    expect(squatOpenMen83.dateISO).toBeTruthy()
    expect(squatOpenMen83.equipment).toBeTruthy()
  })

  it('filtra por levantamiento, sexo, grupo, equipamiento y busqueda', () => {
    const { entries } = buildRecordsRegisterFromMeets()
    const squatOnly = filterRecordsRegister(entries, { lift: 'squat' })
    expect(squatOnly.every((entry) => entry.lift === 'squat')).toBe(true)

    const womenOnly = filterRecordsRegister(entries, { sex: 'women' })
    expect(womenOnly.every((entry) => entry.sex === 'women')).toBe(true)

    const openOnly = filterRecordsRegister(entries, { group: 'open' })
    expect(openOnly.every((entry) => entry.group === 'open')).toBe(true)

    const rawOnly = filterRecordsRegister(entries, { equipment: 'Raw' })
    expect(rawOnly.every((entry) => entry.equipment === 'Raw')).toBe(true)

    const byName = filterRecordsRegister(entries, { query: 'martina' })
    expect(byName.some((entry) => entry.athlete.includes('Martina'))).toBe(true)
  })

  it('agrupa en secciones federativas por sexo, division y clase', () => {
    const { entries } = buildRecordsRegisterFromMeets()
    const sections = groupRecordsFederated(entries)
    expect(sections.length).toBeGreaterThan(0)

    const first = sections[0]
    expect(first).toMatchObject({
      id: expect.any(String),
      group: expect.any(String),
      classes: expect.any(Array),
    })
    expect(first.classes.length).toBeGreaterThan(0)
    expect(first.classes[0].lifts).toBeTruthy()
    expect(first.classMap).toBeUndefined()
  })

  it('exporta CSV con encabezados y filas', () => {
    const { entries } = buildRecordsRegisterFromMeets()
    const csv = buildRecordsCsv(entries.slice(0, 2), t)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('pages.records.exportColumns.sex')
    expect(lines.length).toBe(3)
    expect(lines[1]).toContain('kg')
  })
})
