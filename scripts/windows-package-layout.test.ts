import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const windowsRoot = path.resolve(import.meta.dirname, '..', 'windows')

describe('Windows platform package layout', () => {
  test('keeps the application source and build entrypoints inside the Windows package', () => {
    for (const relativePath of [
      'package.json',
      'src/main/main.ts',
      'electron-builder.ts',
      'scripts/build-release-artifacts.ts',
    ]) {
      expect(existsSync(path.join(windowsRoot, relativePath))).toBe(true)
    }
  })

  test('ignores generated outputs only below the Windows package root', () => {
    const ignoreFile = readFileSync(path.join(windowsRoot, '.gitignore'), 'utf8')

    expect(ignoreFile).toContain('node_modules')
    expect(ignoreFile).toContain('dist')
    expect(ignoreFile).toContain('release')
  })

  test('keeps independent outputs isolated while root owns official Windows release packaging', () => {
    const repoRoot = path.resolve(windowsRoot, '..')
    const rootBuilderConfig = readFileSync(path.join(repoRoot, 'electron-builder.ts'), 'utf8')
    const rootReleaseScript = readFileSync(path.join(repoRoot, 'scripts', 'build-release-artifacts.ts'), 'utf8')

    expect(rootBuilderConfig).toMatch(/^\s*win:\s*\{/m)
    expect(rootReleaseScript).toContain("'windows'")
    expect(rootReleaseScript).toContain("['--win', 'nsis']")
  })
})
