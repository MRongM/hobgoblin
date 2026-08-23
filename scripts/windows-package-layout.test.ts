import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
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

  test('provides a fast WSL wrapper around the Windows-native root packager', () => {
    const repoRoot = path.resolve(windowsRoot, '..')
    const scriptPath = path.join(repoRoot, 'scripts', 'build-windows-from-wsl.sh')

    expect(existsSync(scriptPath)).toBe(true)
    const script = readFileSync(scriptPath, 'utf8')
    expect(script).toContain('command -v bun.exe')
    expect(script).toContain('command -v node.exe')
    expect(script).toContain('run build:web')
    expect(script).toContain("target='dir'")
    expect(script).toContain("target='nsis'")
    expect(script).toContain('install_after_build')
    expect(script).toContain('install-windows-build.ps1')
    expect(script).toContain('--config.npmRebuild=false')
    expect(script).toContain('tmp/electron-cache')
    expect(script).toContain('https://npmmirror.com/mirrors/electron/')
    expect(script).toContain('SHASUMS256.txt')
    expect(script).toContain('--continue-at')
    expect(script).toContain('--proxy')
    expect(script).toContain('system_electron_cache')
    expect(script).toContain('release/win-unpacked')
  })

  test.runIf(process.platform === 'win32')(
    'runs a Windows installer and records its exit status before relaunching',
    () => {
      const repoRoot = path.resolve(windowsRoot, '..')
      const updaterPath = path.join(repoRoot, 'scripts', 'install-windows-build.ps1')
      const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'hobgoblin-updater-'))
      const installerPath = path.join(temporaryRoot, 'fake-installer.cmd')
      const installedAppPath = path.join(temporaryRoot, 'fake-app.cmd')
      const logPath = path.join(temporaryRoot, 'update.log')

      try {
        writeFileSync(installerPath, '@echo off\r\nexit /b 0\r\n')
        writeFileSync(installedAppPath, '@echo off\r\nexit /b 0\r\n')

        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            updaterPath,
            '-InstallerPath',
            installerPath,
            '-InstalledAppPath',
            installedAppPath,
            '-LogPath',
            logPath,
            '-DelaySeconds',
            '0',
            '-SkipRelaunch',
          ],
          { stdio: 'pipe' },
        )

        expect(readFileSync(logPath, 'utf8')).toContain('exit=0')
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true })
      }
    },
  )
})
