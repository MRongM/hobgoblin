import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const launcherPath = path.join(repoRoot, 'bin/hob')
const fixtures: string[] = []

function fixtureDir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'hob-cli-test-'))
  fixtures.push(value)
  return value
}

function installFakeCommand(directory: string, name: string, body: string): void {
  const commandPath = path.join(directory, name)
  writeFileSync(commandPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}

function runLauncher(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync('/bin/sh', [launcherPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('hob macOS launcher', () => {
  test('is shipped as a repository launcher', () => {
    expect(existsSync(launcherPath)).toBe(true)
  })

  test.runIf(process.platform === 'darwin')('opens one absolute directory through the Hobgoblin bundle id', () => {
    const fixture = fixtureDir()
    const fakeBin = path.join(fixture, 'bin')
    const projectDirectory = path.join(fixture, 'project with spaces')
    const outputPath = path.join(fixture, 'open-args')
    mkdirSync(fakeBin)
    mkdirSync(projectDirectory)
    installFakeCommand(fakeBin, 'open', 'printf "%s\\0" "$@" > "$HOB_TEST_OPEN_OUTPUT"')

    const result = runLauncher(['.'], projectDirectory, {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOB_TEST_OPEN_OUTPUT: outputPath,
    })

    expect(result.status).toBe(0)
    expect(readFileSync(outputPath).toString().split('\0').filter(Boolean)).toEqual([
      '-b',
      'hobgoblin.app',
      realpathSync(projectDirectory),
    ])
  })

  test.runIf(process.platform === 'darwin')('defaults to the current directory', () => {
    const fixture = fixtureDir()
    const fakeBin = path.join(fixture, 'bin')
    const outputPath = path.join(fixture, 'open-args')
    mkdirSync(fakeBin)
    installFakeCommand(fakeBin, 'open', 'printf "%s\\0" "$@" > "$HOB_TEST_OPEN_OUTPUT"')

    const result = runLauncher([], fixture, {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOB_TEST_OPEN_OUTPUT: outputPath,
    })

    expect(result.status).toBe(0)
    expect(readFileSync(outputPath).toString().split('\0').filter(Boolean)).toEqual([
      '-b',
      'hobgoblin.app',
      realpathSync(fixture),
    ])
  })

  test('prints help without opening the app', () => {
    const fixture = fixtureDir()
    const result = runLauncher(['--help'], fixture)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: hob [directory]')
  })

  test.runIf(process.platform === 'darwin')('rejects missing directories and multiple paths', () => {
    const fixture = fixtureDir()

    const missing = runLauncher(['missing'], fixture)
    const multiple = runLauncher(['.', '.'], fixture)

    expect(missing.status).toBe(2)
    expect(missing.stderr).toContain('Directory does not exist')
    expect(multiple.status).toBe(2)
    expect(multiple.stderr).toContain('Expected at most one directory')
  })

  test('rejects non-macOS execution before invoking open', () => {
    const fixture = fixtureDir()
    const fakeBin = path.join(fixture, 'bin')
    const outputPath = path.join(fixture, 'open-args')
    mkdirSync(fakeBin)
    installFakeCommand(fakeBin, 'uname', 'printf "Linux\\n"')
    installFakeCommand(fakeBin, 'open', 'printf "%s\\0" "$@" > "$HOB_TEST_OPEN_OUTPUT"')

    const result = runLauncher(['.'], fixture, {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOB_TEST_OPEN_OUTPUT: outputPath,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('macOS only')
    expect(existsSync(outputPath)).toBe(false)
  })
})
