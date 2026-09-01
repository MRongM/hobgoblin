import { describe, expect, test } from 'vitest'
import { assertReleaseHost, createReleaseArtifactPlan, parseReleaseArguments } from './build-release-artifacts.ts'

describe('parseReleaseArguments', () => {
  test.each([
    ['macos', 'arm64'],
    ['macos', 'x64'],
    ['windows', 'arm64'],
    ['windows', 'x64'],
  ] as const)('accepts %s/%s', (platform, arch) => {
    expect(parseReleaseArguments(['--platform', platform, '--arch', arch])).toEqual({ platform, arch })
  })

  test('rejects unsupported or missing platform and architecture values', () => {
    expect(() => parseReleaseArguments(['--platform', 'linux', '--arch', 'x64'])).toThrow(
      '--platform must be "macos" or "windows"',
    )
    expect(() => parseReleaseArguments(['--platform', 'windows', '--arch', 'ia32'])).toThrow(
      '--arch must be "arm64" or "x64"',
    )
    expect(() => parseReleaseArguments([])).toThrow('--platform must be "macos" or "windows"')
  })
})

describe('createReleaseArtifactPlan', () => {
  test('creates the existing macOS DMG plan', () => {
    expect(createReleaseArtifactPlan('macos', 'arm64', '2.2.7')).toEqual({
      requiredHost: 'darwin',
      builderArgs: ['--mac', 'dmg', '--arm64', '--publish', 'never'],
      artifactName: 'Hobgoblin-2.2.7-arm64.dmg',
    })
  })

  test('creates an architecture-qualified Windows NSIS plan', () => {
    expect(createReleaseArtifactPlan('windows', 'x64', '2.2.7')).toEqual({
      requiredHost: 'win32',
      builderArgs: ['--win', 'nsis', '--x64', '--publish', 'never', '--config.npmRebuild=false'],
      artifactName: 'Hobgoblin-2.2.7-x64.exe',
    })
  })
})

describe('assertReleaseHost', () => {
  test('accepts only the native host for each release platform', () => {
    expect(() => assertReleaseHost('macos', 'darwin')).not.toThrow()
    expect(() => assertReleaseHost('windows', 'win32')).not.toThrow()
    expect(() => assertReleaseHost('windows', 'darwin')).toThrow(
      'Windows release artifacts must be built on a Windows runner',
    )
  })
})
