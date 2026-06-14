import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('desktop build scripts', () => {
  test('do not delete local Electron caches', () => {
    const buildScript = readText('scripts/build.ts')
    const downloadCacheScript = readText('scripts/download-electron-cache.ts')

    expect(buildScript).not.toMatch(/rmSync\(.*Library\/Caches\/electron/)
    expect(buildScript).not.toMatch(/rmSync\(.*Library\/Caches\/electron-builder/)
    expect(downloadCacheScript).not.toMatch(/rmSync\(.*Library\/Caches\/electron/)
    expect(downloadCacheScript).not.toMatch(/rmSync\(.*Library\/Caches\/electron-builder/)
  })

  test('build and publish scripts only use the host architecture', () => {
    const buildScript = readText('scripts/build.ts')
    const publishScript = readText('scripts/publish.ts')

    expect(buildScript).not.toContain("['arm64', 'x64']")
    expect(buildScript).not.toContain("for (const arch of ['arm64', 'x64'])")
    expect(buildScript).toContain("const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag]")
    expect(publishScript).toContain('`${APP_NAME} .dmg`, 1')
  })
})
