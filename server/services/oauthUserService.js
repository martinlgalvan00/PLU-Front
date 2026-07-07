import { HttpError } from '../lib/errors.js'
import { serializeUser } from './sessionService.js'

const AUTH0_PROVIDER = 'auth0'

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function assertUsablePayload(payload) {
  if (!payload?.sub) {
    throw new HttpError(401, 'Token OAuth invalido.')
  }

  if (payload.email_verified === false) {
    throw new HttpError(403, 'Email OAuth no verificado.')
  }
}

export async function resolveOAuthUser({ prisma, payload }) {
  assertUsablePayload(payload)

  const providerSubject = payload.sub
  const email = normalizeEmail(payload.email)

  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: AUTH0_PROVIDER,
        providerSubject,
      },
    },
    include: {
      user: {
        include: { profile: true },
      },
    },
  })

  if (identity?.user) {
    if (identity.user.status !== 'active') {
      throw new HttpError(403, 'Usuario OAuth no habilitado.')
    }

    return identity.user
  }

  if (!email) {
    throw new HttpError(403, 'Usuario OAuth no habilitado.')
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      profile: true,
      identities: true,
    },
  })

  if (!user || user.status !== 'active') {
    throw new HttpError(403, 'Usuario OAuth no habilitado.')
  }

  const alreadyLinked = user.identities?.some((item) => {
    return item.provider === AUTH0_PROVIDER && item.providerSubject === providerSubject
  })

  if (!alreadyLinked) {
    await prisma.userIdentity.create({
      data: {
        userId: user.id,
        provider: AUTH0_PROVIDER,
        providerSubject,
        email,
      },
    })
  }

  return user
}

export function serializeOAuthUser(user) {
  return serializeUser(user)
}
