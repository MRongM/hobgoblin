import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { installHobCli } from '../../scripts/install-hob-cli.ts'

const fixtures: string[] = []

function fixtureDir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'hob-cli-install-test-'))
  fixtures.push(value)
  return value
}

function createInstalledApp(root: string): { appPath: string; launcherPath: string } {
  const appPath = path.join(root, 'Applications/Hobgoblin.app')
  const launcherPath = path.join(appPath, 'Contents/Resources/bin/hob')
  mkdirSync(path.dirname(launcherPath), { recursive: true })
  writeFileSync(launcherPath, '#!/bin/sh\n', { mode: 0o755 })
  return { appPath, launcherPath }
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('hob CLI installer', () => {
  test('creates a user-scoped symlink and reports PATH availability', () => {
    const root = fixtureDir()
    const homeDir = path.join(root, 'home')
    const binDir = path.join(homeDir, '.local/bin')
    const { appPath, launcherPath } = createInstalledApp(root)

    const result = installHobCli(appPath, { homeDir, pathValue: `/usr/bin${path.delimiter}${binDir}` })

    expect(result).toEqual({
      status: 'installed',
      sourcePath: launcherPath,
      targetPath: path.join(binDir, 'hob'),
      pathConfigured: true,
    })
    expect(path.resolve(binDir, readlinkSync(path.join(binDir, 'hob')))).toBe(launcherPath)
  })

  test('is idempotent for the launcher it owns', () => {
    const root = fixtureDir()
    const homeDir = path.join(root, 'home')
    const { appPath } = createInstalledApp(root)

    expect(installHobCli(appPath, { homeDir, pathValue: '' }).status).toBe('installed')
    expect(installHobCli(appPath, { homeDir, pathValue: '' })).toMatchObject({
      status: 'already-installed',
      pathConfigured: false,
    })
  })

  test('does not overwrite a regular file or unrelated symlink', () => {
    const root = fixtureDir()
    const homeDir = path.join(root, 'home')
    const binDir = path.join(homeDir, '.local/bin')
    const targetPath = path.join(binDir, 'hob')
    const unrelatedPath = path.join(root, 'other-hob')
    const { appPath } = createInstalledApp(root)
    mkdirSync(binDir, { recursive: true })
    writeFileSync(targetPath, 'existing command')

    expect(installHobCli(appPath, { homeDir, pathValue: '' }).status).toBe('conflict')
    expect(readFileSync(targetPath, 'utf8')).toBe('existing command')

    rmSync(targetPath)
    writeFileSync(unrelatedPath, '#!/bin/sh\n')
    symlinkSync(unrelatedPath, targetPath)
    expect(installHobCli(appPath, { homeDir, pathValue: '' }).status).toBe('conflict')
    expect(path.resolve(binDir, readlinkSync(targetPath))).toBe(unrelatedPath)
  })

  test('reports a missing packaged launcher without creating the command', () => {
    const root = fixtureDir()
    const homeDir = path.join(root, 'home')
    const appPath = path.join(root, 'Applications/Hobgoblin.app')

    const result = installHobCli(appPath, { homeDir, pathValue: '' })

    expect(result.status).toBe('source-missing')
    expect(existsSync(path.join(homeDir, '.local/bin/hob'))).toBe(false)
  })
})
