import { describe, expect, it } from 'vitest'
import { createOrderSchema } from '../server/routes/tickets.js'

/**
 * El formulario ya marca el DNI repetido, pero una orden se puede armar sin
 * pasar por él. Este es el corte que no se puede saltear.
 */
const TYPE = '11111111-1111-4111-8111-111111111111'

function attendee(dni, fullName = 'Camila Rearte') {
  return { fullName, dni, ticketTypeId: TYPE }
}

function order(attendees) {
  return { eventSlug: 'pitbull-classic-2026', attendees }
}

function dniIssues(result) {
  return result.success
    ? []
    : result.error.issues.filter((issue) => issue.path[0] === 'attendees' && issue.path[2] === 'dni')
}

describe('createOrderSchema', () => {
  it('acepta diez personas distintas', () => {
    const attendees = Array.from({ length: 10 }, (_, i) =>
      attendee(String(30000000 + i), `Persona ${i + 1}`),
    )
    expect(createOrderSchema.safeParse(order(attendees)).success).toBe(true)
  })

  it('corta en once', () => {
    const attendees = Array.from({ length: 11 }, (_, i) =>
      attendee(String(30000000 + i), `Persona ${i + 1}`),
    )
    expect(createOrderSchema.safeParse(order(attendees)).success).toBe(false)
  })

  it('rechaza dos entradas con el mismo documento', () => {
    const result = createOrderSchema.safeParse(
      order([attendee('38402115'), attendee('41908330', 'Julián Ferreyra'), attendee('38402115', 'Marina Oliveira')]),
    )

    expect(result.success).toBe(false)
    const issues = dniIssues(result)
    expect(issues).toHaveLength(1)
    // Señala la fila repetida, no la primera.
    expect(issues[0].path).toEqual(['attendees', 2, 'dni'])
    expect(issues[0].message).toMatch(/entradas 1 y 3/)
  })

  it('no inventa un repetido cuando los documentos son distintos', () => {
    const result = createOrderSchema.safeParse(
      order([attendee('38402115'), attendee('41908330', 'Julián Ferreyra')]),
    )
    expect(result.success).toBe(true)
  })
})
