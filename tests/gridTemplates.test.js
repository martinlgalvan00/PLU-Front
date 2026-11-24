import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_TEMPLATES,
  configFromState,
  formatWeightClasses,
  MAX_TEMPLATE_PLATFORMS,
  optionsFromConfig,
  parseWeightClasses,
  platformNamesFromConfig,
} from '../src/lib/gridTemplates.js'
import { DEFAULT_PLAN_OPTIONS, planEventBoard } from '../src/services/eventBoardPlanner.js'

describe('parseWeightClasses', () => {
  it('acepta comas, espacios y punto y coma, con decimal en punto; ordena y saca repetidos', () => {
    expect(parseWeightClasses('57, 47 52;52 63.5').values).toEqual([47, 52, 57, 63.5])
  })

  it('"63,5" no se cuela como una clase de 5 kg: el 5 se marca inválido', () => {
    const result = parseWeightClasses('63,5')
    expect(result.invalid).toBe(true)
    expect(result.values).toEqual([63])
  })

  it('avisa si algún pedazo no es un peso, sin perder los válidos', () => {
    const result = parseWeightClasses('47, abc, -5, 52, 999, 5')
    expect(result.invalid).toBe(true)
    expect(result.values).toEqual([47, 52])
  })

  it('vacío es válido y no inventa clases', () => {
    expect(parseWeightClasses('')).toEqual({ values: [], invalid: false })
    expect(parseWeightClasses(null)).toEqual({ values: [], invalid: false })
  })

  it('formatWeightClasses vuelve a texto editable', () => {
    expect(formatWeightClasses([47, 52.5])).toBe('47, 52.5')
    expect(formatWeightClasses(undefined)).toBe('')
  })
})

describe('optionsFromConfig', () => {
  it('una plantilla vacía o vieja toma los valores por defecto del planificador', () => {
    const options = optionsFromConfig({})
    expect(options.maxPerSession).toBe(DEFAULT_PLAN_OPTIONS.maxPerSession)
    expect(options.groupBy).toEqual(DEFAULT_PLAN_OPTIONS.groupBy)
    expect(options.platformMode).toBe(DEFAULT_PLAN_OPTIONS.platformMode)
    expect(options.schedule).toBeNull()
    expect(options.weightClasses).toBeNull()
    expect(optionsFromConfig(null).sortBy).toBe('weight')
  })

  it('acota el tope por tanda y descarta valores desconocidos', () => {
    expect(optionsFromConfig({ maxPerSession: 500 }).maxPerSession).toBe(100)
    expect(optionsFromConfig({ maxPerSession: 0 }).maxPerSession).toBe(DEFAULT_PLAN_OPTIONS.maxPerSession)
    expect(optionsFromConfig({ platformMode: 'inventado' }).platformMode).toBe('balance')
    expect(optionsFromConfig({ groupBy: ['division', 'peso', 'sex'] }).groupBy).toEqual(['sex', 'division'])
  })

  it('normaliza clases de peso y horarios; sin datos válidos quedan en null', () => {
    const options = optionsFromConfig({
      weightClasses: { Femenino: [57, '47', 'x'], Masculino: [] },
      schedule: { firstStart: '9:30', sessionMinutes: '45', gapMinutes: -3, weighInLeadMinutes: 90 },
    })
    expect(options.weightClasses).toEqual({ Femenino: [47, 57] })
    expect(options.schedule).toEqual({
      firstStart: '9:30',
      sessionMinutes: 45,
      gapMinutes: 0,
      weighInLeadMinutes: 90,
    })
    expect(optionsFromConfig({ schedule: { firstStart: 'mañana', sessionMinutes: 45 } }).schedule).toBeNull()
    expect(optionsFromConfig({ weightClasses: { Femenino: [], Masculino: [] } }).weightClasses).toBeNull()
  })
})

describe('platformNamesFromConfig', () => {
  it('recorta, descarta vacíos y repetidos sin distinguir mayúsculas, y tope de dos', () => {
    expect(platformNamesFromConfig({ platforms: ['  Rojo ', '', 'rojo', 'Azul', 'Verde'] })).toEqual([
      'Rojo',
      'Azul',
    ])
    expect(platformNamesFromConfig({}).length).toBe(0)
    expect(MAX_TEMPLATE_PLATFORMS).toBe(2)
  })
})

describe('configFromState', () => {
  it('guarda lo que se configura y nada del evento (ni días ni atletas)', () => {
    const config = configFromState({
      options: {
        ...DEFAULT_PLAN_OPTIONS,
        maxPerSession: '10',
        groupBy: ['category', 'sex'],
        sortBy: 'age',
        platformMode: 'sex',
        weightClasses: { Masculino: [66, 59] },
        schedule: { firstStart: '09:00', sessionMinutes: 50, gapMinutes: 5, weighInLeadMinutes: 120 },
        dayIndexes: [0, 1],
        useExisting: false,
      },
      platformNames: [' Rojo ', 'Azul'],
    })
    expect(config).toEqual({
      platforms: ['Rojo', 'Azul'],
      maxPerSession: 10,
      groupBy: ['sex', 'category'],
      sortBy: 'age',
      mergeSmall: true,
      platformMode: 'sex',
      weightClasses: { Masculino: [59, 66] },
      schedule: { firstStart: '09:00', sessionMinutes: 50, gapMinutes: 5, weighInLeadMinutes: 120 },
    })
    expect(config).not.toHaveProperty('dayIndexes')
    expect(config).not.toHaveProperty('useExisting')
  })

  it('ida y vuelta: lo guardado vuelve a producir las mismas opciones', () => {
    const original = {
      platforms: ['Tablado 1', 'Tablado 2'],
      maxPerSession: 9,
      groupBy: ['sex'],
      sortBy: 'age',
      mergeSmall: false,
      platformMode: 'alternate',
      weightClasses: { Femenino: [52, 57] },
      schedule: { firstStart: '08:15', sessionMinutes: 40, gapMinutes: 10, weighInLeadMinutes: 60 },
    }
    const options = optionsFromConfig(original)
    const back = configFromState({ options, platformNames: platformNamesFromConfig(original) })
    expect(back).toEqual(original)
  })
})

describe('plantillas predefinidas', () => {
  it('todas se pueden aplicar y producen un plan con tablados', () => {
    const people = Array.from({ length: 30 }, (_, index) => ({
      registrationId: `r${index}`,
      fullName: `A${index}`,
      sex: index % 2 ? 'Femenino' : 'Masculino',
      category: 'Raw',
      division: 'Open',
      bodyweightKg: 55 + index,
      age: 20 + index,
    }))
    for (const template of BUILT_IN_TEMPLATES) {
      const options = optionsFromConfig(template.config)
      const platforms = platformNamesFromConfig(template.config).map((name, index) => ({
        id: `tmp:${index}`,
        name,
      }))
      const plan = planEventBoard({
        unassigned: people,
        days: [{ id: 'd0', dayIndex: 0, label: 'Día 1', sessions: [], withoutSession: [] }],
        platforms,
        ...options,
      })
      expect(plan.placed, template.name).toBe(30)
      expect(plan.leftover, template.name).toEqual([])
      expect(plan.newSessions.every((row) => row.platformId?.startsWith('tmp:')), template.name).toBe(true)
    }
  })

  it('los ids son únicos y están marcados como predefinidos', () => {
    const ids = BUILT_IN_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(BUILT_IN_TEMPLATES.every((template) => template.builtIn)).toBe(true)
  })
})
