#!/usr/bin/env bun
// Build one standard release artifact for the current CI runner.
// Usage: bun scripts/build-release-artifacts.ts --platform macos --arch arm64
//        bun scripts/build-release-artifacts.ts --platform macos --arch x64
import { $ } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = path.resolve(import.meta.dirname, '..')
process.chdir(repoRoot)
$.cwd(repoRoot)

const APP_NAME = 'Hobgoblin'
const viteCli = path.join(repoRoot, 'node_modules/vite/bin/vite.js')
const electronBuilderCli = path.join(repoRoot, 'node_modules/electron-builder/cli.js')

type ReleasePlatform = 'macos'
type ReleaseArch = 'arm64' | 'x64'

const SUPPORTED_ARCHES: ReleaseArch[] = ['arm64', 'x64']

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
  if (value === 'macos') return value
  fail(`Error: --platform must be "macos", got ${JSON.stringify(value)}.`)
}

function parseArch(value: string | undefined): ReleaseArch {
  if (value === 'arm64' || value === 'x64') return value
  fail(`Error: --arch must be "arm64" or "x64", got ${JSON.stringify(value)}.`)
}

function assertSupported(arch: ReleaseArch): void {
  if (SUPPORTED_ARCHES.includes(arch)) return
  fail(`Error: unsupported macOS release architecture ${arch}.`)
}

function assertHostCanBuild(): void {
  if (process.platform === 'darwin') return
  fail('Error: macOS release artifacts must be built on a macOS runner.')
}

function expectedArtifactName(version: string, arch: ReleaseArch): string {
  return `${APP_NAME}-${version}-${arch}.dmg`
}

function assertFileExists(relativePath: string): void {
  const filePath = path.join(repoRoot, relativePath)
  if (existsSync(filePath)) return
  fail(`Error: expected build artifact missing: ${relativePath}`)
}

parsePlatform(values.platform)
const arch = parseArch(values.arch)
assertSupported(arch)
assertHostCanBuild()

const { version } = (await Bun.file(path.join(repoRoot, 'package.json')).json()) as {
  version: string
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`Error: package.json version must be semver-like, got ${JSON.stringify(version)}.`)
}

rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })

await $`bun ${viteCli} build`

assertFileExists('dist/web/index.html')
assertFileExists('dist/web/boot.js')

const platformArgs = ['--mac', 'dmg']
const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
const publishArgs = ['--publish', 'never']
await $`bun ${electronBuilderCli} ${platformArgs} ${archFlag} ${publishArgs}`

const artifactPath = path.join(repoRoot, 'release', expectedArtifactName(version, arch))
if (!existsSync(artifactPath)) {
  fail(`Error: expected release artifact missing: ${path.relative(repoRoot, artifactPath)}`)
}

console.log(`Built release artifact: ${path.relative(repoRoot, artifactPath)}`)
