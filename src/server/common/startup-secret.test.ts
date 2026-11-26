import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { closeSync, readFileSync } from 'node:fs'
import { readServerStartupSecret } from '#/server/common/startup-secret.ts'

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  closeSync: vi.fn(),
  readFileSync: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GOBLIN_SERVER_INTERNAL_SECRET', undefined)
  vi.stubEnv('GOBLIN_SERVER_SECRET_ON_STDIN', undefined)
})

afterEach(() => vi.unstubAllEnvs())

test('reads the startup credential once and closes the inherited descriptor', () => {
  vi.stubEnv('GOBLIN_SERVER_SECRET_ON_STDIN', '1')
  vi.mocked(readFileSync).mockReturnValue('example-startup-secret\n')

  expect(readServerStartupSecret()).toBe('example-startup-secret')
  expect(readServerStartupSecret()).toBeUndefined()
  expect(readFileSync).toHaveBeenCalledExactlyOnceWith(0, 'utf8')
  expect(closeSync).toHaveBeenCalledExactlyOnceWith(0)
})

test('keeps stdin open when the parent has not supplied a credential there', () => {
  expect(readServerStartupSecret()).toBeUndefined()
  expect(readFileSync).not.toHaveBeenCalled()
  expect(closeSync).not.toHaveBeenCalled()
})

test('rejects a legacy environment credential without reading stdin', () => {
  vi.stubEnv('GOBLIN_SERVER_INTERNAL_SECRET', 'example-legacy-secret')
  vi.stubEnv('GOBLIN_SERVER_SECRET_ON_STDIN', '1')

  expect(readServerStartupSecret).toThrow('Server startup credentials must be supplied through stdin')
  expect(readFileSync).not.toHaveBeenCalled()
})

test('closes stdin when the supplied credential is invalid or unreadable', () => {
  vi.stubEnv('GOBLIN_SERVER_SECRET_ON_STDIN', '1')
  vi.mocked(readFileSync).mockReturnValueOnce('   \n')
  expect(readServerStartupSecret).toThrow('Invalid server startup credential on stdin')
  expect(closeSync).toHaveBeenCalledExactlyOnceWith(0)

  vi.stubEnv('GOBLIN_SERVER_SECRET_ON_STDIN', '1')
  vi.mocked(readFileSync).mockImplementationOnce(() => {
    throw new Error('Read failed')
  })
  expect(readServerStartupSecret).toThrow('Read failed')
  expect(vi.mocked(closeSync).mock.calls).toEqual([[0], [0]])
})
