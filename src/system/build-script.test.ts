import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import electronBuilderConfig from '../../electron-builder.ts'
import viteConfig from '../../vite.config.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

interface DesktopBuilderConfig {
  files?: string[]
  extraResources?: Array<{ from: string; to: string }>
  win?: {
    target?: unknown
    artifactName?: string
  }
  nsis?: {
    oneClick?: boolean
    perMachine?: boolean
    allowToChangeInstallationDirectory?: boolean
    include?: string
  }
}

describe('desktop build scripts', () => {
  test('injects the root package version into renderer build metadata', async () => {
    const packageJson = JSON.parse(readText('package.json')) as { version: string }
    if (typeof viteConfig !== 'function') throw new Error('Expected a functional Vite config')

    const config = await viteConfig({
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    })

    expect(config.define?.__APP_VERSION__).toBe(JSON.stringify(packageJson.version))
  })

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
    expect(buildScript).toMatch(/await timeStep\(\s*'bun install',\s*\(\) => \{/)
    expect(buildScript).toContain("await timeStep('node-pty helper check'")
    expect(buildScript).toContain("await timeStep('typecheck', () => $`bun run typecheck`)")
    expect(buildScript).toMatch(/await timeStep\(\s*'typecheck',\s*\(\) => \{/)
    expect(buildScript).toContain("await timeStep('build:web', () => $`bun run build:web`)")
    expect(buildScript).toContain("await timeStep('artifact check'")
    expect(buildScript).toContain(
      "await timeStep('electron-builder', () => $`bun run build:electron -- ${builderArgs}`)",
    )
    expect(buildScript).toContain("await timeStep('close running app', () => closeRunningApp())")
    expect(buildScript).toContain("await timeStep('install app'")
    expect(buildScript).toContain(
      "await timeStep('codesign', () => $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`)",
    )
    expect(buildScript).toContain("await timeStep('install hob CLI'")
    expect(buildScript).toContain('installHobCli(destApp)')
    expect(buildScript).toContain("await timeStep('cleanup release'")
  })

  test('documents the macOS hob launcher in every README language', () => {
    for (const readmePath of ['README.md', 'README.zh-CN.md', 'README.ja.md', 'README.ko.md']) {
      const readme = readText(readmePath)

      expect(readme).toContain('hob .')
      expect(readme).toContain('$HOME/.local/bin/hob')
      expect(readme).toContain('/Applications/Hobgoblin.app/Contents/Resources/bin/hob')
    }
  })

  test('manual release workflow builds macOS, Windows, Android, and Linux artifacts then publishes release assets', () => {
    const workflowPath = path.join(repoRoot, '.github/workflows/release.yml')

    expect(existsSync(workflowPath)).toBe(true)

    const workflow = readText('.github/workflows/release.yml')
    const windowsWorkflow = readText('.github/workflows/windows-test.yml')

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('push:')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('build-macos:')
    expect(workflow).toContain('build-windows:')
    expect(workflow).toContain('build-android:')
    expect(workflow).toContain('build-linux-source:')
    expect(workflow).toContain('publish:')
    expect((workflow.match(/actions\/setup-node@v4/g) ?? []).length).toBe(3)
    expect((workflow.match(/node-version: 24/g) ?? []).length).toBe(3)
    expect(workflow).toContain('bun-version: 1.3.11')
    expect(workflow).toContain('bun install --frozen-lockfile')
    expect(workflow).toContain('bun run typecheck')
    expect(workflow).toContain('bun scripts/build-release-artifacts.ts --platform macos --arch ${{ matrix.arch }}')
    expect(workflow).toContain('uses: ./.github/workflows/windows-test.yml')
    expect(windowsWorkflow).toContain('workflow_call:')
    expect(windowsWorkflow).toContain('fail-fast: false')
    expect(windowsWorkflow).toContain('- arch: x64')
    expect(windowsWorkflow).toContain('runner: windows-latest')
    expect(windowsWorkflow).toContain('- arch: arm64')
    expect(windowsWorkflow).toContain('runner: windows-11-arm')
    expect(windowsWorkflow).toContain('runs-on: ${{ matrix.runner }}')
    expect(windowsWorkflow).toContain('name: Test Windows compatibility')
    for (const windowsTestPath of [
      'src/main/external-open.test.ts',
      'src/main/terminal.test.ts',
      'src/server/terminal/terminal-pty-runtime.test.ts',
      'src/server/terminal/terminal-scope.test.ts',
      'src/shared/file-path-target.test.ts',
      'src/shared/path-semantics.test.ts',
      'src/shared/worktree-guards.test.ts',
      'src/system/open-app.test.ts',
      'src/system/terminals.test.ts',
      'src/system/windows-terminal.test.ts',
      'src/web/components/terminal/terminal-path-links.test.ts',
      'src/web/lib/editor-open-targets.test.ts',
      'src/web/lib/paths.test.ts',
    ]) {
      expect(windowsWorkflow).toContain(windowsTestPath)
    }
    expect(windowsWorkflow).toContain(
      'bun scripts/build-release-artifacts.ts --platform windows --arch ${{ matrix.arch }}',
    )
    expect(windowsWorkflow).toContain('Smoke test packaged Windows app startup')
    expect(windowsWorkflow).toContain('Hobgoblin Smoke 用户 Data')
    expect(windowsWorkflow).toContain('Hobgoblin Terminal 路径 Workspace')
    expect(windowsWorkflow).toContain('name: hobgoblin-windows-startup-logs-${{ matrix.arch }}-${{ github.sha }}')
    expect(windowsWorkflow).toContain('name: hobgoblin-windows-${{ matrix.arch }}-${{ github.sha }}')
    expect(windowsWorkflow).toContain('path: release/Hobgoblin-*-${{ matrix.arch }}.exe')
    expect(workflow).toContain('actions/setup-java@v4')
    expect(workflow).toContain('distribution: temurin')
    expect(workflow).toContain('java-version: 17')
    expect(workflow).toContain('./gradlew --no-daemon :app:assembleRelease')
    expect(workflow).toContain('android/app/build/outputs/apk/release/app-release-unsigned.apk')
    expect(workflow).toContain('node scripts/build-linux-source-archive.ts --output-dir release')
    expect(workflow).toContain('name: hobgoblin-linux-source')
    expect(workflow).toContain('release/Hobgoblin-*-linux-source.tar.gz')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('actions/download-artifact@v4')
    expect(workflow).toContain('needs: [build-macos, build-windows, build-android, build-linux-source]')
    expect(workflow).toContain('GITHUB_SHA')
    expect(workflow).toContain('gh release create "$TAG" --target "$GITHUB_SHA"')
    expect(workflow).toContain('gh release upload "$TAG"')
    expect(workflow).toContain('--clobber')
    expect(workflow).toContain('Hobgoblin-${VERSION}-arm64.dmg')
    expect(workflow).toContain('Hobgoblin-${VERSION}-x64.dmg')
    expect(workflow.split('Hobgoblin-${VERSION}-arm64.exe').length - 1).toBe(2)
    expect(workflow).toContain('Hobgoblin-${VERSION}-x64.exe')
    expect(workflow).toContain('Hobgoblin-${VERSION}-android.apk')
    expect(workflow).toContain('Hobgoblin-${VERSION}-linux-source.tar.gz')
    expect(workflow).toContain('SOURCE="docs/releases/v${VERSION}.md"')
    expect(workflow).toContain('cp "$SOURCE" release-notes.md')
  })

  test('builds a deployment-only Linux source archive', () => {
    const packageJson = JSON.parse(readText('package.json')) as { version: string }
    const outputDir = mkdtempSync(path.join(tmpdir(), 'hobgoblin-linux-source-test-'))
    const extractDir = path.join(outputDir, 'extract')
    const rootName = `Hobgoblin-${packageJson.version}`
    const archivePath = path.join(outputDir, `${rootName}-linux-source.tar.gz`)

    try {
      execFileSync(
        process.execPath,
        [path.join(repoRoot, 'scripts/build-linux-source-archive.ts'), '--output-dir', outputDir],
        { cwd: repoRoot, stdio: 'pipe' },
      )
      mkdirSync(extractDir)
      execFileSync('tar', ['-xzf', archivePath, '-C', extractDir])

      expect(existsSync(path.join(extractDir, rootName, 'scripts/serve-systemd.sh'))).toBe(true)
      expect(existsSync(path.join(extractDir, rootName, 'src/server/bootstrap.ts'))).toBe(true)
      expect(existsSync(path.join(extractDir, rootName, 'src/system/git/helper.ts'))).toBe(true)
      expect(existsSync(path.join(extractDir, rootName, 'src/web/index.html'))).toBe(true)
      expect(statSync(path.join(extractDir, rootName, 'scripts/serve-systemd.sh')).mode & 0o111).not.toBe(0)
      expect(existsSync(path.join(extractDir, rootName, 'src/web/App.test.tsx'))).toBe(false)
      expect(existsSync(path.join(extractDir, rootName, 'src/main/main.ts'))).toBe(false)
      expect(existsSync(path.join(extractDir, rootName, 'android/app/build.gradle.kts'))).toBe(false)
      expect(existsSync(path.join(extractDir, rootName, 'docs'))).toBe(false)
    } finally {
      rmSync(outputDir, { recursive: true, force: true })
    }
  })

  test('release artifact script validates platform-specific standard artifact names', () => {
    const releaseScriptPath = path.join(repoRoot, 'scripts/build-release-artifacts.ts')

    expect(existsSync(releaseScriptPath)).toBe(true)

    const releaseScript = readText('scripts/build-release-artifacts.ts')

    expect(releaseScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(releaseScript).toContain("type ReleasePlatform = 'macos' | 'windows'")
    expect(releaseScript).toContain("type ReleaseArch = 'arm64' | 'x64'")
    expect(releaseScript).toContain("macos: ['arm64', 'x64']")
    expect(releaseScript).toContain("windows: ['arm64', 'x64']")
    expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.dmg`')
    expect(releaseScript).toContain('return `${APP_NAME}-${version}-${arch}.exe`')
    expect(releaseScript).toContain("path.join(repoRoot, 'release', expectedArtifactName(version, platform, arch))")
    expect(releaseScript).toContain("const viteCli = path.join(repoRoot, 'node_modules/vite/bin/vite.js')")
    expect(releaseScript).toContain('await $`bun ${viteCli} build`')
    expect(releaseScript).toContain("const publishArgs = ['--publish', 'never']")
    expect(releaseScript).toContain(
      "const electronBuilderCli = path.join(repoRoot, 'node_modules/electron-builder/cli.js')",
    )
    expect(releaseScript).toContain('await $`bun ${electronBuilderCli} ${platformArgs} ${archFlag} ${publishArgs}`')
  })

  test('desktop packaging includes bundled font notices and licenses', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.files).toEqual(expect.arrayContaining(['THIRD_PARTY_NOTICES.md', 'LICENSES/**/*']))
  })

  test('desktop packaging loads server entrypoints from source without a redundant server bundle', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.files).toEqual(expect.arrayContaining(['src/server/**/*.ts']))
    expect(config.files).not.toContain('dist/server/**/*')
    expect(readText('package.json')).not.toContain('"build:server"')
  })

  test('desktop packaging includes the executable hob launcher outside asar', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.extraResources).toContainEqual({ from: 'bin/hob', to: 'bin/hob' })
    expect(statSync(path.join(repoRoot, 'bin/hob')).mode & 0o111).not.toBe(0)
  })

  test('desktop packaging includes the Windows hob launcher outside asar', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.extraResources).toContainEqual({ from: 'bin/hob.cmd', to: 'bin/hob.cmd' })
    expect(existsSync(path.join(repoRoot, 'bin/hob.cmd'))).toBe(true)
  })

  test('desktop release packaging config includes Windows ARM64 and x64 NSIS output', () => {
    const config = electronBuilderConfig as unknown as DesktopBuilderConfig

    expect(config.win?.target).toEqual([{ target: 'nsis', arch: ['arm64', 'x64'] }])
    expect(config.win?.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
    expect(config.nsis?.oneClick).toBe(false)
    expect(config.nsis?.perMachine).toBe(false)
    expect(config.nsis?.allowToChangeInstallationDirectory).toBe(true)
    expect(config.nsis?.include).toBe('build/installer.nsh')
  })

  test('Windows installer adds and removes only its user PATH entry', () => {
    const installer = readText('build/installer.nsh')

    expect(installer).toContain('!macro customInstall')
    expect(installer).toContain('!macro customUnInstall')
    expect(installer).toContain('-Action "Add"')
    expect(installer).toContain('-Action "Remove"')
    expect(installer).toContain('$INSTDIR\\resources\\bin')
    expect(installer).toContain('${WM_SETTINGCHANGE}')
  })
})
