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
    expect(buildScript).toContain("const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]")
    expect(publishScript).toContain('`${APP_NAME} .dmg`, 1')
  })

  test('install builds can skip redundant dependency and typecheck work', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain('typecheck: { type: \'boolean\', default: false }')
    expect(buildScript).toContain("'skip-typecheck': { type: 'boolean', default: false }")
    expect(buildScript).toContain("'force-install': { type: 'boolean', default: false }")
    expect(buildScript).toContain('const envSkipTypecheck = process.env.SKIP_TYPECHECK')
    expect(buildScript).toContain('const envSkipRebuild = process.env.SKIP_REBUILD')
    expect(buildScript).toContain("shouldRunTypecheck = !truthy(envSkipTypecheck)")
    expect(buildScript).toContain("shouldRunTypecheck = !shouldInstall && values['skip-typecheck'] !== true")
    expect(buildScript).toContain("shouldForceInstall = !truthy(envSkipRebuild)")
    expect(buildScript).toContain('function shouldRunBunInstall(): boolean')
    expect(buildScript).toContain("path.join(repoRoot, 'node_modules')")
    expect(buildScript).toContain("path.join(repoRoot, 'package.json')")
    expect(buildScript).toContain("path.join(repoRoot, 'bun.lock')")
    expect(buildScript).toContain('Skipping bun install (node_modules is up to date).')
    expect(buildScript).toContain('if (shouldRunTypecheck) {')
    expect(buildScript).toContain('Skipping typecheck for fast install.')
  })

  test('install builds skip electron-builder native dependency rebuild', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain("const electronBuilderConfigArgs = shouldInstall ? ['--config.npmRebuild=false'] : []")
    expect(buildScript).toContain("const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]")
  })

  test('clean builds remove dist while normal installs only clear release output', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain("rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })")
    expect(buildScript).toContain('if (shouldClean) {')
    expect(buildScript).toContain("rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true })")
  })
})
