#!/usr/bin/env bun
// Build one standard release artifact for the current CI runner.
// Usage: bun scripts/build-release-artifacts.ts --platform macos --arch arm64
//        bun scripts/build-release-artifacts.ts --platform macos --arch x64
//        bun scripts/build-release-artifacts.ts --platform windows --arch arm64
//        bun scripts/build-release-artifacts.ts --platform windows --arch x64
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = path.resolve(import.meta.dirname, '..')
const APP_NAME = 'Hobgoblin'
const viteCli = path.join(repoRoot, 'node_modules/vite/bin/vite.js')
const electronBuilderCli = path.join(repoRoot, 'node_modules/electron-builder/cli.js')

export type ReleasePlatform = 'macos' | 'windows'
export type ReleaseArch = 'arm64' | 'x64'

export interface ReleaseArtifactPlan {
  requiredHost: 'darwin' | 'win32'
  builderArgs: string[]
  artifactName: string
}

export function parseReleaseArguments(args: string[]): {
  platform: ReleasePlatform
  arch: ReleaseArch
} {
  const { values } = parseArgs({
    args,
    options: {
      platform: { type: 'string' },
      arch: { type: 'string' },
    },
  })
  if (values.platform !== 'macos' && values.platform !== 'windows') {
    throw new Error(`--platform must be "macos" or "windows", got ${JSON.stringify(values.platform)}`)
  }
  if (values.arch !== 'arm64' && values.arch !== 'x64') {
    throw new Error(`--arch must be "arm64" or "x64", got ${JSON.stringify(values.arch)}`)
  }
  return { platform: values.platform, arch: values.arch }
}

export function createReleaseArtifactPlan(
  platform: ReleasePlatform,
  arch: ReleaseArch,
  version: string,
): ReleaseArtifactPlan {
  const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
  const platformArgs = platform === 'macos' ? ['--mac', 'dmg'] : ['--win', 'nsis']
  const extension = platform === 'macos' ? 'dmg' : 'exe'
  return {
    requiredHost: platform === 'macos' ? 'darwin' : 'win32',
    builderArgs: [...platformArgs, archFlag, '--publish', 'never'],
    artifactName: `${APP_NAME}-${version}-${arch}.${extension}`,
  }
}

export function assertReleaseHost(platform: ReleasePlatform, host: NodeJS.Platform): void {
  const expectedHost = platform === 'macos' ? 'darwin' : 'win32'
  if (host === expectedHost) return
  throw new Error(
    platform === 'macos'
      ? 'macOS release artifacts must be built on a macOS runner.'
      : 'Windows release artifacts must be built on a Windows runner.',
  )
}

function assertFileExists(relativePath: string): void {
  if (existsSync(path.join(repoRoot, relativePath))) return
  throw new Error(`expected build artifact missing: ${relativePath}`)
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`build command failed with ${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}`))
    })
  })
}

async function main(): Promise<void> {
  const { platform, arch } = parseReleaseArguments(process.argv.slice(2))
  assertReleaseHost(platform, process.platform)

  const { version } = (await Bun.file(path.join(repoRoot, 'package.json')).json()) as { version: string }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`package.json version must be semver-like, got ${JSON.stringify(version)}.`)
  }

  const plan = createReleaseArtifactPlan(platform, arch, version)
  rmSync(path.join(repoRoot, 'release'), { recursive: true, force: true })
  await run(process.execPath, [viteCli])
  assertFileExists('dist/web/index.html')
  assertFileExists('dist/web/boot.js')
  await run(process.execPath, [electronBuilderCli, ...plan.builderArgs])
  const artifactPath = path.join('release', plan.artifactName)
  assertFileExists(artifactPath)
  console.log(`Built release artifact: ${artifactPath}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
