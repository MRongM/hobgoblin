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
const shouldRunTypecheck = values.typecheck === true || (!shouldInstall && values['skip-typecheck'] !== true)
const shouldForceInstall = values['force-install'] === true

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

// Clear any prior build output so `findBuiltApp` can't pick up a stale
// artifact if electron-builder fails partway through. A matching rm
// after a successful install is run below.
rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
if (shouldClean) {
  rmSync(path.join(repoRoot, 'dist'), { recursive: true, force: true })
}

if (shouldRunBunInstall()) {
  await $`bun install`
} else {
  console.log('Skipping bun install (node_modules is up to date).')
}
if (process.platform === 'darwin') {
  const ptySpawnHelperArches = [process.arch]
  const ptySpawnHelpers = ptySpawnHelperArches.map((arch) =>
    path.join(repoRoot, 'node_modules/node-pty/prebuilds', `darwin-${arch}`, 'spawn-helper'),
  )
  const missingPtySpawnHelpers = ptySpawnHelpers.filter((helper) => !existsSync(helper))
  if (missingPtySpawnHelpers.length > 0) {
    console.error(`Error: missing node-pty darwin spawn-helper(s): ${missingPtySpawnHelpers.join(', ')}`)
    process.exit(1)
  }
  for (const helper of ptySpawnHelpers) {
    chmodSync(helper, 0o755)
  }
}
if (shouldRunTypecheck) {
  await $`bun run typecheck`
} else {
  console.log('Skipping typecheck for fast install.')
}
// Renderer bundle MUST exist before electron-builder packs it (the
// `files` glob in electron-builder.ts expects `dist/web/`).
await $`bun run build:web`
await $`bun run build:server`
const webDist = path.join(repoRoot, 'dist/web')
for (const artifact of [path.join(webDist, 'index.html'), path.join(webDist, 'boot.js')]) {
  if (!existsSync(artifact)) {
    console.error(`Error: web build artifact missing: ${artifact}`)
    process.exit(1)
  }
}
const serverDistEntry = path.join(repoRoot, 'dist/server/main.js')
if (!existsSync(serverDistEntry)) {
  console.error(`Error: server build artifact missing: ${serverDistEntry}`)
  process.exit(1)
}
const terminalWorkerDistEntry = path.join(repoRoot, 'dist/server/terminal-worker.js')
if (!existsSync(terminalWorkerDistEntry)) {
  console.error(`Error: server build artifact missing: ${terminalWorkerDistEntry}`)
  process.exit(1)
}
// `dir` target skips dmg packaging for install. Every build mode pins to the
// host arch so local builds don't waste time cross-building unused artifacts.
const archFlag = process.arch === 'arm64' ? '--arm64' : '--x64'
const electronBuilderConfigArgs = shouldInstall ? ['--config.npmRebuild=false'] : []
const builderArgs = ['--mac', shouldInstall ? 'dir' : 'dmg', archFlag, ...electronBuilderConfigArgs]
await $`bun run build:electron -- ${builderArgs}`

const srcApp = await findBuiltApp()
if (!srcApp) {
  console.error(`Error: could not find built ${APP_NAME}.app under release/`)
  process.exit(1)
}
console.log(`Built: ${path.relative(repoRoot, srcApp)}`)

if (shouldInstall) {
  if (process.platform !== 'darwin') {
    console.error('install mode is macOS-only')
    process.exit(1)
  }

  console.log(`Installing ${APP_NAME}.app to ~/Applications...`)

  // Close a running Hobgoblin.app before replacing it. Relative path because
  // scripts/ sits outside src/ and isn't covered by the `#/` alias.
  await closeRunningApp()

  const appsDir = path.join(os.homedir(), 'Applications')
  mkdirSync(appsDir, { recursive: true })
  const destApp = path.join(appsDir, `${APP_NAME}.app`)
  rmSync(destApp, { recursive: true, force: true })
  renameSync(srcApp, destApp)
  console.log(`Installed: ${destApp}`)

  // electron-builder's ad-hoc signature (identity: null) uses the Electron
  // binary identifier and does not bind Info.plist. macOS Notification Center
  // identifies apps by the code-signing identifier, not CFBundleIdentifier, so
  // without re-signing the app appears as "Electron" in notification settings
  // and the NSUserNotificationAlertStyle plist key has no effect.
  // Re-signing with --identifier forces the correct bundle ID and binds the
  // Info.plist so notifications work and Hobgoblin appears in System Settings.
  console.log('Re-signing with correct bundle identifier...')
  await $`codesign --force --deep --sign - --identifier ${APP_ID} ${destApp}`
  console.log('Re-signed.')

  rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
  console.log('Done.')
}
