import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { resolveNativeWindowsOpenSshExecutable } from '#/system/ssh/executable.ts'

describe('resolveNativeWindowsOpenSshExecutable', () => {
  test('resolves the trusted SystemRoot OpenSSH executable case-insensitively', () => {
    const fileExists = existingFiles('C:\\Windows\\System32\\OpenSSH\\ssh.exe')

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { systemroot: 'C:\\Windows' },
        fileExists,
      }),
    ).toBe('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
  })

  test('deduplicates equivalent SystemRoot and WINDIR candidates', () => {
    const fileExists = vi.fn(existingFiles('C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe'))

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { SystemRoot: 'C:\\WINDOWS', windir: 'C:\\Windows' },
        fileExists,
      }),
    ).toBe('C:\\WINDOWS\\System32\\OpenSSH\\ssh.exe')
    expect(fileExists).toHaveBeenCalledTimes(1)
  })

  test('uses WINDIR when SystemRoot is absent', () => {
    const fileExists = existingFiles('D:\\Windows\\System32\\OpenSSH\\ssh.exe')

    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'win32',
        env: { windir: 'D:\\Windows' },
        fileExists,
      }),
    ).toBe('D:\\Windows\\System32\\OpenSSH\\ssh.exe')
  })

  test('returns null for missing, relative, or non-Windows candidates', () => {
    const fileExists = vi.fn(() => false)

    expect(
      resolveNativeWindowsOpenSshExecutable({ platform: 'win32', env: { SystemRoot: 'Windows' }, fileExists }),
    ).toBeNull()
    expect(resolveNativeWindowsOpenSshExecutable({ platform: 'win32', env: {}, fileExists })).toBeNull()
    expect(
      resolveNativeWindowsOpenSshExecutable({
        platform: 'linux',
        env: { SystemRoot: 'C:\\Windows' },
        fileExists,
      }),
    ).toBeNull()
    expect(fileExists).not.toHaveBeenCalled()
  })
})

function existingFiles(...files: string[]): (candidate: string) => boolean {
  const normalized = new Set(files.map((file) => path.win32.normalize(file).toLowerCase()))
  return (candidate) => normalized.has(path.win32.normalize(candidate).toLowerCase())
}
