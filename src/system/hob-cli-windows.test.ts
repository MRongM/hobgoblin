import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const launcherPath = path.join(repoRoot, 'bin/hob.cmd')
const fixtures: string[] = []

function fixtureDir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'hob-cli-windows-test-'))
  fixtures.push(value)
  return value
}

function installCaptureCommand(directory: string): { capturePath: string; executablePath: string } {
  const capturePath = path.join(directory, 'captured-arguments.txt')
  const executablePath = path.join(directory, 'capture.cmd')
  writeFileSync(
    executablePath,
    [
      '@echo off',
      '> "%HOB_TEST_CAPTURE%" echo(%~1',
      '>> "%HOB_TEST_CAPTURE%" echo(%~2',
      'exit /b 0',
      '',
    ].join('\r\n'),
  )
  return { capturePath, executablePath }
}

function runLauncher(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
  commandPath = launcherPath,
) {
  return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', commandPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function captureEnvironment(fixture: string): {
  capturePath: string
  env: NodeJS.ProcessEnv
} {
  const { capturePath, executablePath } = installCaptureCommand(fixture)
  return {
    capturePath,
    env: {
      HOBGOBLIN_CLI_EXECUTABLE: executablePath,
      HOB_TEST_CAPTURE: capturePath,
    },
  }
}

function readCapturedArguments(capturePath: string): string[] {
  return readFileSync(capturePath, 'utf8').split(/\r?\n/).filter(Boolean)
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe.runIf(process.platform === 'win32')('hob Windows launcher', () => {
  test('is shipped as a repository launcher', () => {
    expect(existsSync(launcherPath)).toBe(true)
  })

  test('opens a directory with spaces using the explicit app argument', () => {
    const fixture = fixtureDir()
    const projectDirectory = path.join(fixture, 'project with spaces')
    mkdirSync(projectDirectory)
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher(['.'], projectDirectory, env)

    expect(result.status).toBe(0)
    expect(readCapturedArguments(capturePath)).toEqual([
      '--hob-open',
      path.resolve(projectDirectory),
    ])
  })

  test('defaults to the current directory', () => {
    const fixture = fixtureDir()
    const projectDirectory = path.join(fixture, 'project with spaces')
    mkdirSync(projectDirectory)
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher([], projectDirectory, env)

    expect(result.status).toBe(0)
    expect(readCapturedArguments(capturePath)).toEqual([
      '--hob-open',
      path.resolve(projectDirectory),
    ])
  })

  test.each(['-h', '--help'])('prints help for %s without opening the app', (helpArgument) => {
    const fixture = fixtureDir()
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher([helpArgument], fixture, env)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: hob [directory]')
    expect(existsSync(capturePath)).toBe(false)
  })

  test('rejects an unknown option without opening the app', () => {
    const fixture = fixtureDir()
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher(['--unknown'], fixture, env)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Unknown option')
    expect(existsSync(capturePath)).toBe(false)
  })

  test('rejects more than one directory without opening the app', () => {
    const fixture = fixtureDir()
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher(['.', '.'], fixture, env)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Expected at most one directory')
    expect(existsSync(capturePath)).toBe(false)
  })

  test('rejects a missing directory without opening the app', () => {
    const fixture = fixtureDir()
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher(['missing-project'], fixture, env)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Directory does not exist')
    expect(existsSync(capturePath)).toBe(false)
  })

  test('rejects a regular file without opening the app', () => {
    const fixture = fixtureDir()
    const regularFile = path.join(fixture, 'project.txt')
    writeFileSync(regularFile, 'fixture')
    const { capturePath, env } = captureEnvironment(fixture)

    const result = runLauncher([regularFile], fixture, env)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Not a directory')
    expect(existsSync(capturePath)).toBe(false)
  })

  test('reports a missing installed application executable', () => {
    const fixture = fixtureDir()

    const result = runLauncher(['.'], fixture, { HOBGOBLIN_CLI_EXECUTABLE: '' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Hobgoblin.exe')
  })
})
