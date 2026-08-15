import { describe, expect, test } from 'vitest'
import { expectedWindowsArtifactName, parseWindowsReleaseArguments } from './build-release-artifacts.ts'

describe('parseWindowsReleaseArguments', () => {
  test('accepts one supported Windows architecture', () => {
    expect(parseWindowsReleaseArguments(['--arch', 'arm64'])).toEqual({ arch: 'arm64' })
  })

  test('rejects unsupported or missing architectures', () => {
    expect(() => parseWindowsReleaseArguments(['--arch', 'ia32'])).toThrow('x64 or arm64')
    expect(() => parseWindowsReleaseArguments([])).toThrow('x64 or arm64')
  })
})

describe('expectedWindowsArtifactName', () => {
  test('keeps architecture in the Windows installer filename', () => {
    expect(expectedWindowsArtifactName('2.2.5', 'x64')).toBe('Hobgoblin-2.2.5-x64.exe')
  })
})
