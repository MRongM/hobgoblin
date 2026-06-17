import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import electronBuilderConfig from '../../electron-builder.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

interface DesktopBuilderConfig {
  win?: {
    target?: unknown
    artifactName?: string
  }
  nsis?: {
    oneClick?: boolean
    perMachine?: boolean
    allowToChangeInstallationDirectory?: boolean
  }
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
    expect(buildScript).toContain(
      "const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]",
    )
    expect(publishScript).toContain('`${APP_NAME} .dmg`, 1')
  })

  test('install builds can skip redundant dependency and typecheck work', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain("typecheck: { type: 'boolean', default: false }")
    expect(buildScript).toContain("'skip-typecheck': { type: 'boolean', default: false }")
    expect(buildScript).toContain("'force-install': { type: 'boolean', default: false }")
    expect(buildScript).toContain('const envSkipTypecheck = process.env.SKIP_TYPECHECK')
    expect(buildScript).toContain('const envSkipRebuild = process.env.SKIP_REBUILD')
    expect(buildScript).toContain('shouldRunTypecheck = !truthy(envSkipTypecheck)')
    expect(buildScript).toContain("shouldRunTypecheck = !shouldInstall && values['skip-typecheck'] !== true")
    expect(buildScript).toContain('shouldForceInstall = !truthy(envSkipRebuild)')
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

    expect(buildScript).toContain(
      "const electronBuilderConfigArgs = shouldInstall ? ['--config.npmRebuild=false'] : []",
    )
    expect(buildScript).toContain(
      "const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]",
    )
  })

  test('clean builds remove dist while normal installs only clear release output', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain("rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })")
    expect(buildScript).toContain('if (shouldClean) {')
    expect(buildScript).toContain("rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true })")
  })

  test('build script prints timing diagnostics for install stages', () => {
    const buildScript = readText('scripts/build.ts')

    expect(buildScript).toContain('function formatDuration(ms: number): string')
    expect(buildScript).toContain('async function timeStep<T>(')
    expect(buildScript).toContain('skipped in ${duration}')
    expect(buildScript).toContain('console.log(`[timing] total: ${formatDuration(Date.now() - totalStartedAt)}`)')

    expect(buildScript).toContain("await timeStep('prepare output'")
    expect(buildScript).toContain("await timeStep('bun install check'")
    expect(buildScript).toContain("await timeStep('bun install', () => $`bun install`)")
    expect(buildScript).toContain("await timeStep('bun install', () => {")
    expect(buildScript).toContain("await timeStep('node-pty helper check'")
    expect(buildScript).toContain("await timeStep('typecheck', () => $`bun run typecheck`)")
    expect(buildScript).toContain("await timeStep('typecheck', () => {")
    expect(buildScript).toContain("await timeStep('build:web', () => $`bun run build:web`)")
    expect(buildScript).toContain("await timeStep('build:server', () => $`bun run build:server`)")
    expect(buildScript).toContain("await timeStep('artifact check'")
    expect(buildScript).toContain(
      "await timeStep('electron-builder', () => $`bun run build:electron -- ${builderArgs}`)",
    )
    expect(buildScript).toContain("await timeStep('close running app', () => closeRunningApp())")
    expect(buildScript).toContain("await timeStep('install app'")
    expect(buildScript).toContain(
      "await timeStep('codesign', () => $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`)",
    )
    expect(buildScript).toContain("await timeStep('cleanup release'")
  })

  test('manual release workflow builds macOS and Windows artifacts then publishes release assets', () => {
    const workflowPath = path.join(repoRoot, '.github/workflows/release.yml')

    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readText('.github/workflows/release.yml')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('push:')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('build-macos:')
    expect(workflow).toContain('build-windows:')
    expect(workflow).toContain('publish:')
    expect(workflow).toContain('bun-version: 1.3.11')
    expect(workflow).toContain('bun install --frozen-lockfile')
    expect(workflow).toContain('bun run typecheck')
    expect(workflow).toContain('bun scripts/build-release-artifacts.ts --platform macos --arch ${{ matrix.arch }}')
    expect(workflow).toContain('bun scripts/build-release-artifacts.ts --platform windows --arch x64')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('actions/download-artifact@v4')
    expect(workflow).toContain('GITHUB_SHA')
    expect(workflow).toContain('gh release create "$TAG" --target "$GITHUB_SHA"')
    expect(workflow).toContain('gh release upload "$TAG"')
    expect(workflow).toContain('--clobber')
    expect(workflow).toContain('Hobgoblin-${VERSION}-arm64.dmg')
    expect(workflow).toContain('Hobgoblin-${VERSION}-x64.dmg')
    expect(workflow).toContain('Hobgoblin-${VERSION}-x64.exe')
  })

  test('release artifact script validates platform-specific standard artifact names', () => {
    const releaseScriptPath = path.join(repoRoot, 'scripts/build-release-artifacts.ts')

    expect(existsSync(releaseScriptPath)).toBe(true)

    const releaseScript = readText('scripts/build-release-artifacts.ts')

    expect(releaseScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(releaseScript).toContain("type ReleasePlatform = 'macos' | 'windows'")
    expect(releaseScript).toContain("type ReleaseArch = 'arm64' | 'x64'")
    expect(releaseScript).toContain("macos: ['arm64', 'x64']")
    expect(releaseScript).toContain("windows: ['x64']")
    expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.dmg`')
    expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.exe`')
    expect(releaseScript).toContain("path.join(repoRoot, 'release', expectedArtifactName(version, platform, arch))")
    expect(releaseScript).toContain('bun run build:web')
    expect(releaseScript).toContain('bun run build:server')
    expect(releaseScript).toContain('bun run build:electron')
  })

  test('desktop release packaging config includes Windows x64 NSIS output', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.win?.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
    expect(config.win?.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
    expect(config.nsis?.oneClick).toBe(false)
    expect(config.nsis?.perMachine).toBe(false)
    expect(config.nsis?.allowToChangeInstallationDirectory).toBe(true)
  })
})
