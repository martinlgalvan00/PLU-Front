import { describe, expect, it } from 'vitest'
import {
  buildRegistrationCheckoutPath,
  matchRegistrationCheckoutRoute,
} from '../src/lib/registrationCheckoutRoute.js'
import { isCanonicalPathname, resolvePathnamePublicView } from '../src/lib/canonicalPaths.js'
import { matchEventPageRoute } from '../src/lib/eventPageRoute.js'

describe('ruta del checkout de inscripción', () => {
  it('ida y vuelta entre slug y path', () => {
    const path = buildRegistrationCheckoutPath('barbell-submission-2027')
    expect(path).toBe('/evento/barbell-submission-2027/inscripcion')
    expect(matchRegistrationCheckoutRoute(path)).toEqual({ eventSlug: 'barbell-submission-2027' })
    expect(matchRegistrationCheckoutRoute(`${path}/`)).toEqual({
      eventSlug: 'barbell-submission-2027',
    })
  })

  it('es una entrada canónica que abre el checkout, sin pisar la ficha del evento', () => {
    const path = '/evento/barbell-submission-2027/inscripcion'
    expect(isCanonicalPathname(path)).toBe(true)
    expect(resolvePathnamePublicView(path)).toBe('competition')
    expect(matchEventPageRoute(path)).toBeNull()
    expect(resolvePathnamePublicView('/evento/barbell-submission-2027')).toBe('events')
    expect(matchRegistrationCheckoutRoute('/evento/barbell-submission-2027')).toBeNull()
  })
})
