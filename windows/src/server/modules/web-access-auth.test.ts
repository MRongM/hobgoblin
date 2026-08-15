import { expect, test } from 'vitest'
import {
  createWebAccessAuth,
  hashWebAccessPassword,
  verifyWebAccessPassword,
} from '#/server/modules/web-access-auth.ts'

test('hashes passwords with independent salts and verifies without exposing plaintext', async () => {
  const first = await hashWebAccessPassword('test-password')
  const second = await hashWebAccessPassword('test-password')

  expect(first).not.toBe(second)
  expect(first).not.toContain('test-password')
  await expect(verifyWebAccessPassword('test-password', first)).resolves.toBe(true)
  await expect(verifyWebAccessPassword('wrong-password', first)).resolves.toBe(false)
  await expect(verifyWebAccessPassword('test-password', 'invalid-hash')).resolves.toBe(false)
})

test('creates anonymous page capabilities only while protection is disabled', async () => {
  let credentials = { enabled: false, username: '', passwordHash: '' }
  const auth = createWebAccessAuth({
    readCredentials: async () => credentials,
    randomToken: tokenSequence('anonymous-token'),
  })

  const token = await auth.createPageCapability()
  expect(token).toBe('anonymous-token')
  await expect(auth.protectionEnabled()).resolves.toBe(false)
  await expect(auth.validateToken(token!)).resolves.toBe(true)

  credentials = { enabled: true, username: 'operator', passwordHash: await hashWebAccessPassword('test-password') }
  await expect(auth.protectionEnabled()).resolves.toBe(true)
  await expect(auth.validateToken(token!)).resolves.toBe(false)
  await expect(auth.createPageCapability()).resolves.toBeNull()
})

test('authenticates protected access and rejects wrong credentials with the same result', async () => {
  const passwordHash = await hashWebAccessPassword('test-password')
  const auth = createWebAccessAuth({
    readCredentials: async () => ({ enabled: true, username: 'operator', passwordHash }),
    randomToken: tokenSequence('authenticated-token'),
  })

  await expect(auth.authenticate('wrong-user', 'test-password')).resolves.toBeNull()
  await expect(auth.authenticate('operator', 'wrong-password')).resolves.toBeNull()
  const token = await auth.authenticate('operator', 'test-password')
  expect(token).toBe('authenticated-token')
  await expect(auth.createPageCapability(token)).resolves.toBe(token)
  await expect(auth.validateToken(token!)).resolves.toBe(true)
})

test('expires sessions after seven days and revokes all sessions immediately', async () => {
  let now = 1_000
  const passwordHash = await hashWebAccessPassword('test-password')
  const auth = createWebAccessAuth({
    readCredentials: async () => ({ enabled: true, username: 'operator', passwordHash }),
    now: () => now,
    randomToken: tokenSequence('first-token', 'second-token'),
  })

  const first = await auth.authenticate('operator', 'test-password')
  now += 7 * 24 * 60 * 60 * 1_000 - 1
  await expect(auth.validateToken(first!)).resolves.toBe(true)
  now += 1
  await expect(auth.validateToken(first!)).resolves.toBe(false)

  const second = await auth.authenticate('operator', 'test-password')
  auth.revokeToken(second!)
  await expect(auth.validateToken(second!)).resolves.toBe(false)

  const third = await auth.authenticate('operator', 'test-password')
  auth.revokeAll()
  await expect(auth.validateToken(third!)).resolves.toBe(false)
})

function tokenSequence(...tokens: string[]): () => string {
  let index = 0
  return () => tokens[index++] ?? `token-${index}`
}
