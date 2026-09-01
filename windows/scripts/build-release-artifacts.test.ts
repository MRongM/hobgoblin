import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import electronBuilderConfig from '../electron-builder.ts'
import { expectedWindowsArtifactName, parseWindowsReleaseArguments } from './build-release-artifacts.ts'

interface WindowsBuilderConfig {
  asarUnpack?: string[]
  afterPack?: (context: { appOutDir: string; electronPlatformName: string; arch: number }) => Promise<void> | void
}

const WINDOWS_ARCH_CASES = [
  { arch: 'x64', builderArch: 1 },
  { arch: 'arm64', builderArch: 3 },
] as const

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
    expect(expectedWindowsArtifactName('2.3.1', 'x64')).toBe('Hobgoblin-2.3.1-x64.exe')
  })
})

describe('Windows release packaging', () => {
  test('unpacks rebuilt node-pty ConPTY assets', () => {
    const config = electronBuilderConfig as unknown as WindowsBuilderConfig

    expect(config.asarUnpack).toContain('node_modules/node-pty/build/Release/**/*')
  })

  test.each(WINDOWS_ARCH_CASES)(
    'restores $arch ConPTY companion assets after native rebuilds',
    async ({ arch, builderArch }) => {
      const appOutDir = mkdtempSync(path.join(tmpdir(), 'hobgoblin-independent-conpty-'))
      const sourceDir = path.join(
        appOutDir,
        `resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-${arch}/conpty`,
      )
      const destinationDir = path.join(
        appOutDir,
        'resources/app.asar.unpacked/node_modules/node-pty/build/Release/conpty',
      )
      mkdirSync(sourceDir, { recursive: true })
      writeFileSync(path.join(sourceDir, 'conpty.dll'), `${arch} dll`)
      writeFileSync(path.join(sourceDir, 'OpenConsole.exe'), `${arch} console`)

      try {
        const config = electronBuilderConfig as unknown as WindowsBuilderConfig
        expect(config.afterPack).toBeTypeOf('function')

        await config.afterPack?.({ appOutDir, electronPlatformName: 'win32', arch: builderArch })

        expect(readFileSync(path.join(destinationDir, 'conpty.dll'), 'utf8')).toBe(`${arch} dll`)
        expect(readFileSync(path.join(destinationDir, 'OpenConsole.exe'), 'utf8')).toBe(`${arch} console`)
      } finally {
        rmSync(appOutDir, { recursive: true, force: true })
      }
    },
  )
})
