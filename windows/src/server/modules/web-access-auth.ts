import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_COST = 16_384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const SALT_BYTES = 16
const HASH_BYTES = 32
const WEB_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export interface WebAccessCredentials {
  enabled: boolean
  username: string
  passwordHash: string
}

interface WebSession {
  kind: 'anonymous' | 'authenticated'
  expiresAt: number
  credentialsKey: string
}

export interface WebAccessAuth {
  protectionEnabled(): Promise<boolean>
  createPageCapability(cookieToken?: string | null): Promise<string | null>
  authenticate(username: string, password: string): Promise<string | null>
  validateToken(token: string): Promise<boolean>
  revokeToken(token: string): void
  revokeAll(): void
}

interface WebAccessAuthOptions {
  readCredentials: () => Promise<WebAccessCredentials>
  now?: () => number
  randomToken?: () => string
}

export async function hashWebAccessPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await scrypt(password, salt, HASH_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('hex'),
    hash.toString('hex'),
  ].join('$')
}

export function isWebAccessPasswordHash(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const [algorithm, cost, blockSize, parallelization, salt, hash, extra] = value.split('$')
  return (
    extra === undefined &&
    algorithm === 'scrypt' &&
    cost === String(SCRYPT_COST) &&
    blockSize === String(SCRYPT_BLOCK_SIZE) &&
    parallelization === String(SCRYPT_PARALLELIZATION) &&
    /^[0-9a-f]{32}$/u.test(salt ?? '') &&
    /^[0-9a-f]{64}$/u.test(hash ?? '')
  )
}

export async function verifyWebAccessPassword(password: string, serializedHash: string): Promise<boolean> {
  if (!isWebAccessPasswordHash(serializedHash)) return false
  const [, cost, blockSize, parallelization, saltHex, hashHex] = serializedHash.split('$')
  const expected = Buffer.from(hashHex!, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex!, 'hex'), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createWebAccessAuth(options: WebAccessAuthOptions): WebAccessAuth {
  const now = options.now ?? Date.now
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString('hex'))
  const sessions = new Map<string, WebSession>()

  function createSession(kind: WebSession['kind'], credentialsKey: string): string {
    let token = randomToken()
    while (!token || sessions.has(token)) token = randomToken()
    sessions.set(token, { kind, credentialsKey, expiresAt: now() + WEB_SESSION_TTL_MS })
    return token
  }

  async function validateToken(token: string): Promise<boolean> {
    const session = sessions.get(token)
    if (!session) return false
    if (session.expiresAt <= now()) {
      sessions.delete(token)
      return false
    }
    const credentials = await options.readCredentials()
    if (session.kind === 'anonymous') return !credentials.enabled
    return credentials.enabled && session.credentialsKey === credentialsKey(credentials)
  }

  return {
    async protectionEnabled(): Promise<boolean> {
      return (await options.readCredentials()).enabled
    },

    async createPageCapability(cookieToken): Promise<string | null> {
      const credentials = await options.readCredentials()
      if (!credentials.enabled) return createSession('anonymous', '')
      if (!cookieToken || !(await validateToken(cookieToken))) return null
      return cookieToken
    },

    async authenticate(username, password): Promise<string | null> {
      const credentials = await options.readCredentials()
      if (!credentials.enabled || !isWebAccessPasswordHash(credentials.passwordHash)) return null
      const [usernameMatches, passwordMatches] = await Promise.all([
        Promise.resolve(sameText(username, credentials.username)),
        verifyWebAccessPassword(password, credentials.passwordHash),
      ])
      if (!usernameMatches || !passwordMatches) return null
      return createSession('authenticated', credentialsKey(credentials))
    },

    validateToken,

    revokeToken(token): void {
      sessions.delete(token)
    },

    revokeAll(): void {
      sessions.clear()
    },
  }
}

function credentialsKey(credentials: WebAccessCredentials): string {
  return createHash('sha256').update(credentials.username).update('\0').update(credentials.passwordHash).digest('hex')
}

function sameText(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}
