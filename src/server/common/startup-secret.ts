import { closeSync, readFileSync } from 'node:fs'

export function readServerStartupSecret(): string | undefined {
  if (process.env.GOBLIN_SERVER_INTERNAL_SECRET?.trim()) {
    throw new Error('Server startup credentials must be supplied through stdin. Update the service configuration.')
  }
  const readFromStdin = process.env.GOBLIN_SERVER_SECRET_ON_STDIN === '1'
  delete process.env.GOBLIN_SERVER_SECRET_ON_STDIN
  if (!readFromStdin) return undefined

  let secret: string
  try {
    secret = readFileSync(0, 'utf8').trim()
  } finally {
    closeSync(0)
  }
  if (!secret || /[\x00-\x1f\x7f]/u.test(secret)) throw new Error('Invalid server startup credential on stdin')
  return secret
}
