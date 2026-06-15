#!/usr/bin/env bun
// Build and package Hobgoblin.
//   default → host-arch .dmg and Hobgoblin.app under release/mac*/
//   install → builds the `dir` target only (no dmg packaging) and moves
//             Hobgoblin.app into ~/Applications, closing any running instance
//             first. macOS-only.
//
// Usage: ./scripts/build.ts [install|i] [--clean] [--typecheck] [--skip-typecheck] [--force-install]
import { $ } from 'bun'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { closeRunningApp } from './close-app.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
process.chdir(repoRoot)
$.cwd(repoRoot)

const APP_NAME = 'Hobgoblin'
const APP_ID = 'hobgoblin.app'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    clean: { type: 'boolean', default: false },
    typecheck: { type: 'boolean', default: false },
    'skip-typecheck': { type: 'boolean', default: false },
    'force-install': { type: 'boolean', default: false },
  },
})
const mode = positionals[0]
const shouldInstall = mode === 'install' || mode === 'i'
const shouldClean = values.clean === true

// install.ts forwards --full as SKIP_TYPECHECK=0 / SKIP_REBUILD=0; honor
// the same env vars here so the install.ts fast-path / full-path semantics
// work end-to-end. CLI flags (--typecheck, --skip-typecheck, --force-install)
// take precedence over the env vars; when neither is set, install mode keeps
// its skip-typecheck fast path.
const envSkipTypecheck = process.env.SKIP_TYPECHECK
const envSkipRebuild = process.env.SKIP_REBUILD
const truthy = (v: string | undefined) => v === '1' || v === 'true'

let shouldRunTypecheck: boolean
if (values.typecheck === true) {
  shouldRunTypecheck = true
} else if (envSkipTypecheck !== undefined) {
  shouldRunTypecheck = !truthy(envSkipTypecheck)
} else {
  shouldRunTypecheck = !shouldInstall && values['skip-typecheck'] !== true
}

let shouldForceInstall: boolean
if (values['force-install'] === true) {
  shouldForceInstall = true
} else if (envSkipRebuild !== undefined) {
  shouldForceInstall = !truthy(envSkipRebuild)
} else {
  shouldForceInstall = false
}

async function findBuiltApp(): Promise<string | null> {
  // mac dir target emits one directory per declared arch (`mac-arm64`,
  // `mac` for x64). Pick the one matching the host so `install` puts the
  // right binary in ~/Applications.
  const hostDir = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
  const candidate = path.join(repoRoot, 'release', hostDir, `${APP_NAME}.app`)
  return existsSync(candidate) ? candidate : null
}

function newestMtime(paths: string[]): number {
  let newest = 0
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue
    newest = Math.max(newest, statSync(filePath).mtimeMs)
  }
  return newest
}

function shouldRunBunInstall(): boolean {
  if (shouldClean || shouldForceInstall) return true

  const nodeModulesDir = path.join(repoRoot, 'node_modules')
  if (!existsSync(nodeModulesDir)) return true

  const dependencyInputs = [path.join(repoRoot, 'package.json'), path.join(repoRoot, 'bun.lock')]
  return newestMtime(dependencyInputs) > statSync(nodeModulesDir).mtimeMs
}

class BuildScriptFailure extends Error {
  exitCode: number

  constructor(exitCode = 1) {
    super('build script failed')
    this.exitCode = exitCode
  }
}

function fail(message: string): never {
  console.error(message)
  throw new BuildScriptFailure()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

async function timeStep<T>(
  label: string,
  action: () => T | Promise<T>,
  options: { skipped?: boolean } = {},
): Promise<T> {
  const startedAt = Date.now()
  try {
    return await action()
  } finally {
    const duration = formatDuration(Date.now() - startedAt)
    const detail = options.skipped === true ? `skipped in ${duration}` : duration
    console.log(`[timing] ${label}: ${detail}`)
  }
}

async function main(): Promise<void> {
  // Clear any prior build output so `findBuiltApp` can't pick up a stale
  // artifact if electron-builder fails partway through. A matching rm
  // after a successful install is run below.
  await timeStep('prepare output', () => {
    rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
    if (shouldClean) {
      rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true })
    }
  })

  const needsBunInstall = await timeStep('bun install check', () => shouldRunBunInstall())
  if (needsBunInstall) {
    await timeStep('bun install', () => $`bun install`)
  } else {
    await timeStep('bun install', () => {
      console.log('Skipping bun install (node_modules is up to date).')
    }, { skipped: true })
  }

  await timeStep('node-pty helper check', () => {
    if (process.platform !== 'darwin') return

    const ptySpawnHelperArches = [process.arch]
    const ptySpawnHelpers = ptySpawnHelperArches.map((arch) =>
      path.join(repoRoot, 'node_modules/node-pty/prebuilds', `darwin-${arch}`, 'spawn-helper'),
    )
    const missingPtySpawnHelpers = ptySpawnHelpers.filter((helper) => !existsSync(helper))
    if (missingPtySpawnHelpers.length > 0) {
      fail(`Error: missing node-pty darwin spawn-helper(s): ${missingPtySpawnHelpers.join(', ')}`)
    }
    for (const helper of ptySpawnHelpers) {
      chmodSync(helper, 0o755)
    }
  })

  if (shouldRunTypecheck) {
    await timeStep('typecheck', () => $`bun run typecheck`)
  } else {
    await timeStep('typecheck', () => {
      console.log('Skipping typecheck for fast install.')
    }, { skipped: true })
  }

  // Renderer bundle MUST exist before electron-builder packs it (the
  // `files` glob in electron-builder.ts expects `dist/web/`).
  await timeStep('build:web', () => $`bun run build:web`)
  await timeStep('build:server', () => $`bun run build:server`)
  await timeStep('artifact check', () => {
    const webDist = path.join(repoRoot, 'dist/web')
    for (const artifact of [path.join(webDist, 'index.html'), path.join(webDist, 'boot.js')]) {
      if (!existsSync(artifact)) {
        fail(`Error: web build artifact missing: ${artifact}`)
      }
    }
    const serverDistEntry = path.join(repoRoot, 'dist/server/main.js')
    if (!existsSync(serverDistEntry)) {
      fail(`Error: server build artifact missing: ${serverDistEntry}`)
    }
    const terminalWorkerDistEntry = path.join(repoRoot, 'dist/server/terminal-worker.js')
    if (!existsSync(terminalWorkerDistEntry)) {
      fail(`Error: server build artifact missing: ${terminalWorkerDistEntry}`)
    }
  })

  // `dir` target skips dmg packaging for install. Every build mode pins to the
  // host arch so local builds don't waste time cross-building unused artifacts.
  const archFlag = process.arch === 'arm64' ? '--arm64' : '--x64'
  const electronBuilderConfigArgs = shouldInstall ? ['--config.npmRebuild=false'] : []
  const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]
  await timeStep('electron-builder', () => $`bun run build:electron -- ${builderArgs}`)

  const srcApp = await findBuiltApp()
  if (!srcApp) {
    fail(`Error: could not find built ${APP_NAME}.app under release/`)
  }
  console.log(`Built: ${path.relative(repoRoot, srcApp)}`)

  if (!shouldInstall) return

  if (process.platform !== 'darwin') {
    fail('install mode is macOS-only')
  }

  console.log(`Installing ${APP_NAME}.app to ~/Applications...`)

  // Close a running Hobgoblin.app before replacing it. Relative path because
  // scripts/ sits outside src/ and isn't covered by the `#/` alias.
  await timeStep('close running app', () => closeRunningApp())

  const appsDir = path.join(os.homedir(), 'Applications')
  const destApp = path.join(appsDir, `${APP_NAME}.app`)
  await timeStep('install app', () => {
    mkdirSync(appsDir, { recursive: true })
    rmSync(destApp, { recursive: true, force: true })
    renameSync(srcApp, destApp)
    console.log(`Installed: ${destApp}`)
  })

  // electron-builder's ad-hoc signature (identity: null) uses the Electron
  // binary identifier and does not bind Info.plist. macOS Notification Center
  // identifies apps by the code-signing identifier, not CFBundleIdentifier, so
  // without re-signing the app appears as "Electron" in notification settings
  // and the NSUserNotificationAlertStyle plist key has no effect.
  // Re-signing with --identifier forces the correct bundle ID and binds the
  // Info.plist so notifications work and Hobgoblin appears in System Settings.
  console.log('Re-signing with correct bundle identifier...')
  await timeStep('codesign', () => $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`)
  console.log('Re-signed.')

  await timeStep('cleanup release', () => {
    rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
    console.log('Done.')
  })
}

const totalStartedAt = Date.now()
try {
  await main()
} catch (error) {
  if (error instanceof BuildScriptFailure) {
    process.exitCode = error.exitCode
  } else {
    throw error
  }
} finally {
  console.log(`[timing] total: ${formatDuration(Date.now() - totalStartedAt)}`)
}
