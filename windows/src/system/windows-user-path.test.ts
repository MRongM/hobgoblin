import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const scriptPath = path.join(repoRoot, 'build/windows-user-path.ps1')

interface PathTransformResult {
  Changed: boolean
  Value: string
}

function transform(action: 'Add' | 'Remove', entry: string, pathValue: string): PathTransformResult {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Action',
      action,
      '-Entry',
      entry,
      '-TransformOnly',
      '-PathValue',
      pathValue,
    ],
    { encoding: 'utf8' },
  )

  expect(result.status, result.stderr || result.stdout).toBe(0)
  return JSON.parse(result.stdout.trim()) as PathTransformResult
}

describe('Windows hob user PATH helper', () => {
  test('is shipped as a repository build helper', () => {
    expect(existsSync(scriptPath)).toBe(true)
  })

  test('updates only the current user environment without using the truncating setx command', () => {
    const source = readFileSync(scriptPath, 'utf8')

    expect(source).toContain('[EnvironmentVariableTarget]::User')
    expect(source).toContain('TransformOnly')
    expect(source).not.toMatch(/\bsetx\b/i)
  })

  test.runIf(process.platform === 'win32')('adds an entry to an empty PATH', () => {
    const entry = 'C:\\Apps\\Hobgoblin\\resources\\bin'

    expect(transform('Add', entry, '')).toEqual({ Changed: true, Value: entry })
  })

  test.runIf(process.platform === 'win32')('does not duplicate an exact entry', () => {
    const entry = 'C:\\Apps\\Hobgoblin\\resources\\bin'
    const pathValue = `C:\\Tools;${entry}`

    expect(transform('Add', entry, pathValue)).toEqual({ Changed: false, Value: pathValue })
  })

  test.runIf(process.platform === 'win32')('compares entries case-insensitively without a trailing separator', () => {
    const entry = 'C:\\Apps\\Hobgoblin\\resources\\bin'
    const pathValue = `C:\\Tools;${entry.toUpperCase()}\\`

    expect(transform('Add', entry, pathValue)).toEqual({ Changed: false, Value: pathValue })
  })

  test.runIf(process.platform === 'win32')('removes only an exact entry', () => {
    const entry = 'C:\\Apps\\Hobgoblin\\resources\\bin'

    expect(transform('Remove', entry, `C:\\Tools;${entry};C:\\Other`)).toEqual({
      Changed: true,
      Value: 'C:\\Tools;C:\\Other',
    })
  })

  test.runIf(process.platform === 'win32')('preserves a path that only starts with the entry', () => {
    const entry = 'C:\\Apps\\Hobgoblin\\resources\\bin'
    const pathValue = `C:\\Tools;${entry}-other`

    expect(transform('Remove', entry, pathValue)).toEqual({ Changed: false, Value: pathValue })
  })
})
