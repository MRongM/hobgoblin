import type { MiddlewareHandler } from 'hono'

export function createInternalAuthMiddleware(
  secret: string,
  options?: { validateWebSession: (token: string) => Promise<boolean> },
): MiddlewareHandler {
  return async (c, next) => {
    const token = c.req.header('x-goblin-internal-secret') ?? ''
    const internalCapabilityValid = Boolean(secret) && token === secret
    const webCapabilityValid =
      !internalCapabilityValid && Boolean(token) && Boolean(await options?.validateWebSession(token))
    if (!internalCapabilityValid && !webCapabilityValid) {
      return c.json({ ok: false, message: 'Unauthorized' }, 401)
    }
    await next()
  }
}
