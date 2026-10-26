import { describe, expect, it } from 'vitest'
import {
  EXTRA_MODALITY_PRICE_RATIO,
  REGISTRATION_MODALITIES,
  SECOND_DIVISION_PRICE_RATIO,
  extraModalityCount,
  extraModalitySurcharge,
  normalizeDivisionSelection,
  normalizeModalities,
  priceRegistrationSelection,
  selectionFromForm,
  divisionsFromChoices,
  choicesFromDivisions,
  toggleModality,
  secondDivisionSurcharge,
  validateDivisionSelection,
  validateModalities,
} from '../shared/registrationSelection.js'

// Evento del 2026-09-15: nacida el 2005-01-10 tiene 21 años (Junior), nacido
// el 1995-01-10 tiene 31 (Open), nacido el 1980-01-10 tiene 46 (Masters).
const EVENT_DATE = '2026-09-15'
const JUNIOR = '2005-01-10'
const OPEN_AGE = '1995-01-10'
const MASTER = '1980-01-10'

describe('normalizeDivisionSelection', () => {
  it('una sola división no tiene segunda', () => {
    expect(normalizeDivisionSelection({ division: 'Junior' })).toEqual({
      primary: 'Junior',
      secondary: '',
    })
  })

  it('la división de edad queda primera y Open segunda, sin importar el orden', () => {
    expect(normalizeDivisionSelection({ division: 'Junior', secondaryDivision: 'Open' })).toEqual({
      primary: 'Junior',
      secondary: 'Open',
    })
    expect(normalizeDivisionSelection({ division: 'Open', secondaryDivision: 'Junior' })).toEqual({
      primary: 'Junior',
      secondary: 'Open',
    })
  })

  it('una segunda igual a la primera se descarta', () => {
    expect(normalizeDivisionSelection({ division: 'Open', secondaryDivision: 'Open' })).toEqual({
      primary: 'Open',
      secondary: '',
    })
  })

  it('canoniza alias heredados', () => {
    expect(normalizeDivisionSelection({ division: 'master', secondaryDivision: 'open' })).toEqual({
      primary: 'Masters',
      secondary: 'Open',
    })
  })
})

describe('validateDivisionSelection', () => {
  const check = (selection, birthDate) =>
    validateDivisionSelection({ ...selection, birthDate, referenceDate: EVENT_DATE })

  it('un Junior puede inscribirse en Junior y en Open', () => {
    expect(check({ division: 'Junior', secondaryDivision: 'Open' }, JUNIOR)).toMatchObject({
      ok: true,
      primary: 'Junior',
      secondary: 'Open',
    })
  })

  it('un Master puede inscribirse solo en Open', () => {
    expect(check({ division: 'Open' }, MASTER)).toMatchObject({ ok: true, primary: 'Open', secondary: '' })
  })

  it('rechaza una división que no corresponde a la edad', () => {
    expect(check({ division: 'Masters' }, JUNIOR)).toMatchObject({
      ok: false,
      code: 'DIVISION_AGE_MISMATCH',
      allowed: ['Junior', 'Open'],
    })
  })

  it('rechaza una segunda división que no corresponde a la edad', () => {
    expect(check({ division: 'Junior', secondaryDivision: 'Masters' }, JUNIOR)).toMatchObject({
      ok: false,
      code: 'DIVISION_AGE_MISMATCH',
    })
  })

  it('quien ya está en Open por edad no tiene una segunda división', () => {
    expect(check({ division: 'Open', secondaryDivision: 'Junior' }, OPEN_AGE)).toMatchObject({
      ok: false,
      code: 'DIVISION_AGE_MISMATCH',
    })
  })

  it('una división desconocida es inválida', () => {
    expect(check({ division: 'Elite' }, JUNIOR)).toMatchObject({ ok: false, code: 'DIVISION_INVALID' })
  })

  it('sin fecha de nacimiento valida solo que existan y difieran', () => {
    expect(check({ division: 'Junior', secondaryDivision: 'Open' }, null)).toMatchObject({ ok: true })
  })
})

describe('precio de la segunda división', () => {
  it('la segunda división cuesta la mitad', () => {
    expect(SECOND_DIVISION_PRICE_RATIO).toBe(0.5)
    expect(secondDivisionSurcharge(75000)).toBe(37500)
  })

  it('redondea al peso entero', () => {
    expect(secondDivisionSurcharge(75001)).toBe(37501)
    expect(secondDivisionSurcharge(0)).toBe(0)
    expect(secondDivisionSurcharge(null)).toBe(0)
  })

  it('una sola división paga el 100%', () => {
    expect(priceRegistrationSelection({ basePrice: 75000, manualPrice: 60000 })).toEqual({
      defaultPrice: 75000,
      manualPrice: 60000,
      surcharge: 0,
      manualSurcharge: 0,
      modalitySurcharge: 0,
      manualModalitySurcharge: 0,
    })
  })

  it('la primera paga el 100% y la segunda el 50%, en cada canal', () => {
    expect(
      priceRegistrationSelection({ basePrice: 75000, manualPrice: 60000, secondary: 'Open' }),
    ).toEqual({
      defaultPrice: 112500,
      manualPrice: 90000,
      surcharge: 37500,
      manualSurcharge: 30000,
      modalitySurcharge: 0,
      manualModalitySurcharge: 0,
    })
  })

  it('sin precio manual no inventa uno', () => {
    expect(priceRegistrationSelection({ basePrice: 75000, manualPrice: null, secondary: 'Open' })).toMatchObject({
      defaultPrice: 112500,
      manualPrice: null,
    })
  })
})

describe('precio de las modalidades extra', () => {
  it('Full Power sola, o cualquier modalidad sola, paga el 100%', () => {
    expect(EXTRA_MODALITY_PRICE_RATIO).toBe(0.5)
    for (const modalities of [['full_power'], ['bench'], ['push_pull'], []]) {
      expect(extraModalityCount(modalities)).toBe(0)
      expect(priceRegistrationSelection({ basePrice: 100000, modalities }).defaultPrice).toBe(100000)
    }
  })

  it('cada modalidad además de la primera suma el 50% de la base', () => {
    expect(extraModalityCount(['full_power', 'bench'])).toBe(1)
    expect(extraModalitySurcharge(100000, ['full_power', 'bench'])).toBe(50000)
    expect(
      priceRegistrationSelection({ basePrice: 100000, modalities: ['full_power', 'bench'] }),
    ).toMatchObject({ defaultPrice: 150000, modalitySurcharge: 50000 })
    expect(
      priceRegistrationSelection({
        basePrice: 100000,
        modalities: ['full_power', 'bench', 'squat'],
      }).defaultPrice,
    ).toBe(200000)
  })

  it('no cuenta repetidos ni valores desconocidos', () => {
    expect(extraModalityCount(['full_power', 'full_power', 'snatch'])).toBe(0)
  })

  it('Open y modalidad extra se suman sobre la base, no se componen', () => {
    expect(
      priceRegistrationSelection({
        basePrice: 100000,
        secondary: 'Open',
        modalities: ['full_power', 'bench'],
      }),
    ).toMatchObject({ defaultPrice: 200000, surcharge: 50000, modalitySurcharge: 50000 })
  })

  it('aplica a cada canal con su propio precio', () => {
    expect(
      priceRegistrationSelection({
        basePrice: 100000,
        manualPrice: 80000,
        secondary: 'Open',
        modalities: ['full_power', 'deadlift'],
      }),
    ).toMatchObject({ defaultPrice: 200000, manualPrice: 160000, manualModalitySurcharge: 40000 })
  })

  it('en Submission los recargos se repiten por categoría', () => {
    expect(
      priceRegistrationSelection({
        basePrice: 100000,
        secondary: 'Open',
        categoryCount: 2,
        modalities: ['full_power', 'bench'],
      }).defaultPrice,
    ).toBe(400000)
  })
})

describe('modalidades', () => {
  it('el catálogo incluye Full Power y las modalidades parciales', () => {
    expect(REGISTRATION_MODALITIES).toEqual(['full_power', 'push_pull', 'squat', 'bench', 'deadlift'])
  })

  it('normaliza: descarta lo desconocido y repetido, y deja Full Power primero', () => {
    expect(normalizeModalities(['bench', 'full_power', 'bench', 'rumba', ''])).toEqual([
      'full_power',
      'bench',
    ])
    expect(normalizeModalities('full_power')).toEqual(['full_power'])
    expect(normalizeModalities(null)).toEqual([])
  })

  it('Full Power sola es válida', () => {
    expect(validateModalities(['full_power'])).toEqual({ ok: true, modalities: ['full_power'] })
  })

  it('una modalidad parcial sola es válida', () => {
    expect(validateModalities(['bench'])).toEqual({ ok: true, modalities: ['bench'] })
  })

  it('Full Power y otra modalidad a la vez es válido', () => {
    expect(validateModalities(['full_power', 'bench'])).toEqual({
      ok: true,
      modalities: ['full_power', 'bench'],
    })
    expect(validateModalities(['deadlift', 'full_power'])).toEqual({
      ok: true,
      modalities: ['full_power', 'deadlift'],
    })
  })

  it('cualquier combinación de especialidades es válida, en orden canónico', () => {
    expect(validateModalities(['deadlift', 'bench'])).toEqual({
      ok: true,
      modalities: ['bench', 'deadlift'],
    })
    expect(validateModalities(['bench', 'squat'])).toEqual({
      ok: true,
      modalities: ['squat', 'bench'],
    })
    expect(validateModalities(['full_power', 'squat', 'bench'])).toEqual({
      ok: true,
      modalities: ['full_power', 'squat', 'bench'],
    })
  })

  it('exige al menos una modalidad', () => {
    expect(validateModalities([])).toMatchObject({ ok: false, code: 'MODALITY_REQUIRED' })
    expect(validateModalities(undefined)).toMatchObject({ ok: false, code: 'MODALITY_REQUIRED' })
  })

  it('rechaza una modalidad desconocida', () => {
    expect(validateModalities(['full_power', 'rumba'])).toMatchObject({
      ok: false,
      code: 'MODALITY_INVALID',
    })
  })

  it('Push-Pull ya incluye banco y peso muerto: no se combina con ellos', () => {
    expect(validateModalities(['push_pull', 'bench'])).toMatchObject({
      ok: false,
      code: 'MODALITY_COMBINATION_INVALID',
    })
    expect(validateModalities(['push_pull', 'deadlift'])).toMatchObject({
      ok: false,
      code: 'MODALITY_COMBINATION_INVALID',
    })
  })

  it('Push-Pull sí se combina con sentadilla o con Full Power', () => {
    expect(validateModalities(['push_pull', 'squat']).ok).toBe(true)
    expect(validateModalities(['full_power', 'push_pull']).ok).toBe(true)
  })
})

describe('selectionFromForm', () => {
  it('el formulario viejo, sin campos nuevos, compite Full Power en una sola división', () => {
    expect(selectionFromForm({ division: 'Junior' })).toEqual({
      division: 'Junior',
      secondaryDivision: '',
      modalities: ['full_power'],
    })
  })

  it('toma las modalidades elegidas y la segunda división del formulario', () => {
    expect(
      selectionFromForm({
        division: 'Junior',
        secondaryDivision: 'Open',
        modalities: ['bench', 'squat'],
      }),
    ).toEqual({ division: 'Junior', secondaryDivision: 'Open', modalities: ['squat', 'bench'] })
  })

  it('una lista vacía queda vacía: la validación la rechaza, no se inventa Full Power', () => {
    expect(selectionFromForm({ division: 'Open', modalities: [] }).modalities).toEqual([])
  })
})

describe('divisionsFromChoices / choicesFromDivisions', () => {
  it('solo la división de edad', () => {
    expect(divisionsFromChoices({ natural: 'Junior', age: true, open: false })).toEqual({
      division: 'Junior',
      secondaryDivision: '',
    })
  })

  it('solo Open', () => {
    expect(divisionsFromChoices({ natural: 'Junior', age: false, open: true })).toEqual({
      division: 'Open',
      secondaryDivision: '',
    })
  })

  it('las dos: la de edad paga 100% y Open es la segunda', () => {
    expect(divisionsFromChoices({ natural: 'Junior', age: true, open: true })).toEqual({
      division: 'Junior',
      secondaryDivision: 'Open',
    })
  })

  it('quien tiene Open por edad no tiene otra opción', () => {
    expect(divisionsFromChoices({ natural: 'Open', age: true, open: false })).toEqual({
      division: 'Open',
      secondaryDivision: '',
    })
  })

  it('sin ninguna elegida no hay división', () => {
    expect(divisionsFromChoices({ natural: 'Junior', age: false, open: false })).toEqual({
      division: '',
      secondaryDivision: '',
    })
  })

  it('lee las casillas desde la selección guardada', () => {
    expect(choicesFromDivisions({ division: 'Junior', secondaryDivision: 'Open' })).toEqual({
      age: true,
      open: true,
    })
    expect(choicesFromDivisions({ division: 'Open', secondaryDivision: '' }, 'Junior')).toEqual({
      age: false,
      open: true,
    })
    expect(choicesFromDivisions({ division: 'Junior', secondaryDivision: '' }, 'Junior')).toEqual({
      age: true,
      open: false,
    })
  })
})

describe('toggleModality', () => {
  it('agrega y quita una modalidad', () => {
    expect(toggleModality(['full_power'], 'bench')).toEqual(['full_power', 'bench'])
    expect(toggleModality(['full_power', 'bench'], 'bench')).toEqual(['full_power'])
  })

  it('puede quedar vacía: la validación pide elegir una', () => {
    expect(toggleModality(['full_power'], 'full_power')).toEqual([])
  })

  it('elegir Push-Pull saca banco y peso muerto, que ya incluye', () => {
    expect(toggleModality(['bench', 'deadlift', 'squat'], 'push_pull')).toEqual(['push_pull', 'squat'])
  })

  it('elegir banco o peso muerto saca Push-Pull', () => {
    expect(toggleModality(['push_pull'], 'bench')).toEqual(['bench'])
    expect(toggleModality(['full_power', 'push_pull'], 'deadlift')).toEqual(['full_power', 'deadlift'])
  })

  it('siempre devuelve el orden canónico', () => {
    expect(toggleModality(['bench'], 'full_power')).toEqual(['full_power', 'bench'])
  })
})
