#!/usr/bin/env bun
// Build one standard release artifact for the current CI runner.
// Usage: bun scripts/build-release-artifacts.ts --platform macos --arch arm64
//        bun scripts/build-release-artifacts.ts --platform macos --arch x64
//        bun scripts/build-release-artifacts.ts --platform windows --arch x64
import { $ } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = path.resolve(import.meta.dirname, '..')
process.chdir(repoRoot)
$.cwd(repoRoot)

const APP_NAME = 'Hobgoblin'

type ReleasePlatform = 'macos' | 'windows'
type ReleaseArch = 'arm64' | 'x64'

const SUPPORTED_ARCHES: Record<ReleasePlatform, ReleaseArch[]> = {
  macos: ['arm64', 'x64'],
  windows: ['x64'],
}

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    arch: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parsePlatform(value: string | undefined): ReleasePlatform {
  if (value === 'macos' || value === 'windows') return value
  fail(`Error: --platform must be "macos" or "windows", got ${JSON.stringify(value)}.`)
}

function parseArch(value: string | undefined): ReleaseArch {
  if (value === 'arm64' || value === 'x64') return value
  fail(`Error: --arch must be "arm64" or "x64", got ${JSON.stringify(value)}.`)
}

function assertSupported(platform: ReleasePlatform, arch: ReleaseArch): void {
  if (SUPPORTED_ARCHES[platform].includes(arch)) return
  fail(`Error: unsupported release target ${platform}/${arch}.`)
}

function assertHostCanBuild(platform: ReleasePlatform): void {
  if (platform === 'macos' && process.platform !== 'darwin') {
    fail('Error: macOS release artifacts must be built on a macOS runner.')
  }
  if (platform === 'windows' && process.platform !== 'win32') {
    fail('Error: Windows release artifacts must be built on a Windows runner.')
  }
}

function expectedArtifactName(version: string, platform: ReleasePlatform, arch: ReleaseArch): string {
  if (platform === 'macos') return `${APP_NAME}-${version}-${arch}.dmg`
  return `${APP_NAME}-${version}-${arch}.exe`
}

function assertFileExists(relativePath: string): void {
  const filePath = path.join(repoRoot, relativePath)
  if (existsSync(filePath)) return
  fail(`Error: expected build artifact missing: ${relativePath}`)
}

const platform = parsePlatform(values.platform)
const arch = parseArch(values.arch)
assertSupported(platform, arch)
assertHostCanBuild(platform)

const { version } = (await Bun.file(path.join(repoRoot, 'package.json')).json()) as {
  version: string
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Error: package.json version must be semver-like, got ${JSON.stringify(version)}.`)
}

rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })

await $`bun run build:web`
await $`bun run build:server`

assertFileExists('dist/web/index.html')
assertFileExists('dist/web/boot.js')
assertFileExists('dist/server/main.js')
assertFileExists('dist/server/terminal-worker.js')

const platformArgs = platform === 'macos' ? ['--mac', 'dmg'] : ['--win', 'nsis']
const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
await $`bun run build:electron -- ${platformArgs} ${archFlag}`

const artifactPath = path.join(repoRoot, 'release', expectedArtifactName(version, platform, arch))
if (!existsSync(artifactPath)) {
  fail(`Error: expected release artifact missing: ${path.relative(repoRoot, artifactPath)}`)
}

console.log(`Built release artifact: ${path.relative(repoRoot, artifactPath)}`)
