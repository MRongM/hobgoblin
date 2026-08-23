import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { resolveGitExecutable } from '#/system/git/executable.ts'

describe('resolveGitExecutable', () => {
  test('prefers the native ProgramW6432 Git for Windows installation before other locations', () => {
    const fileExists = existingFiles(
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Tools\\Git\\cmd\\git.exe',
    )

    expect(
      resolveGitExecutable({
        platform: 'win32',
        env: {
          ProgramW6432: 'C:\\Program Files',
          'ProgramFiles(x86)': 'C:\\Program Files (x86)',
          PATH: 'C:\\Tools\\Git\\cmd',
        },
        fileExists,
      }),
    ).toBe('C:\\Program Files\\Git\\cmd\\git.exe')
  })

  test('checks LocalAppData after both Program Files locations', () => {
    const fileExists = existingFiles('C:\\Users\\dev\\AppData\\Local\\Programs\\Git\\cmd\\git.exe')

    expect(
      resolveGitExecutable({
        platform: 'win32',
        env: {
          LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
          ProgramFiles: 'C:\\Program Files',
        },
        fileExists,
      }),
    ).toBe('C:\\Users\\dev\\AppData\\Local\\Programs\\Git\\cmd\\git.exe')
  })

  test('finds git.exe in an absolute PATH directory with case-insensitive environment lookup', () => {
    const fileExists = existingFiles('C:\\Tools\\Git\\cmd\\git.exe')

    expect(
      resolveGitExecutable({
        platform: 'win32',
        env: { path: '.;tools;"C:\\Tools\\Git\\cmd"' },
        fileExists,
      }),
    ).toBe('C:\\Tools\\Git\\cmd\\git.exe')
  })

  test('deduplicates equivalent candidates without changing the first spelling', () => {
    const fileExists = vi.fn(existingFiles('C:\\PROGRAM FILES\\Git\\cmd\\git.exe'))

    expect(
      resolveGitExecutable({
        platform: 'win32',
        env: {
          ProgramW6432: 'C:\\PROGRAM FILES',
          ProgramFiles: 'c:\\program files',
          PATH: 'C:\\PROGRAM FILES\\Git\\cmd',
        },
        fileExists,
      }),
    ).toBe('C:\\PROGRAM FILES\\Git\\cmd\\git.exe')
    expect(fileExists).toHaveBeenCalledTimes(1)
  })

  test('never probes relative PATH entries or the current repository directory', () => {
    const fileExists = vi.fn(() => false)

    expect(
      resolveGitExecutable({
        platform: 'win32',
        env: { PATH: '.;tools;..\\bin' },
        fileExists,
      }),
    ).toBeNull()
    expect(fileExists).not.toHaveBeenCalled()
  })

  test('keeps inherited PATH lookup on non-Windows platforms', () => {
    const fileExists = vi.fn(() => false)

    expect(resolveGitExecutable({ platform: 'darwin', env: {}, fileExists })).toBe('git')
    expect(resolveGitExecutable({ platform: 'linux', env: {}, fileExists })).toBe('git')
    expect(fileExists).not.toHaveBeenCalled()
  })
})

function existingFiles(...files: string[]): (candidate: string) => boolean {
  const normalized = new Set(files.map(normalizeWindowsPath))
  return (candidate) => normalized.has(normalizeWindowsPath(candidate))
}

function normalizeWindowsPath(value: string): string {
  return path.win32.normalize(value).toLowerCase()
}
