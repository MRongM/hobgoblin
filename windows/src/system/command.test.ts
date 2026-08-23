import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { hasCommand } from '#/system/command.ts'

const mocks = vi.hoisted(() => ({
  accessSync: vi.fn(),
  lstatSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  accessSync: mocks.accessSync,
  constants: { X_OK: 1 },
  lstatSync: mocks.lstatSync,
  statSync: mocks.statSync,
}))

describe('hasCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PATH', '')
    mocks.accessSync.mockReturnValue(undefined)
    mocks.statSync.mockReturnValue({ isFile: () => true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('accepts a regular executable file', () => {
    expect(hasCommand('tool', ['/tools'])).toBe(true)
    expect(mocks.accessSync).toHaveBeenCalledWith(path.join('/tools', 'tool'), 1)
  })

  test('accepts an accessible app execution alias when stat cannot follow it', () => {
    mocks.statSync.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    })
    mocks.lstatSync.mockReturnValue({ isSymbolicLink: () => true })

    expect(hasCommand('wt.exe', ['/WindowsApps'])).toBe(true)
    expect(mocks.accessSync).toHaveBeenCalledWith(path.join('/WindowsApps', 'wt.exe'), 1)
  })

  test('rejects a stat failure that is not a symbolic link', () => {
    mocks.statSync.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    })
    mocks.lstatSync.mockReturnValue({ isSymbolicLink: () => false })

    expect(hasCommand('wt.exe', ['/WindowsApps'])).toBe(false)
    expect(mocks.accessSync).not.toHaveBeenCalled()
  })

  test('rejects an app execution alias that is not accessible', () => {
    mocks.statSync.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    })
    mocks.lstatSync.mockReturnValue({ isSymbolicLink: () => true })
    mocks.accessSync.mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    })

    expect(hasCommand('wt.exe', ['/WindowsApps'])).toBe(false)
  })
})
