#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const packageRoot = path.resolve(import.meta.dirname, '..')
const APP_NAME = 'Hobgoblin'

export type WindowsReleaseArch = 'arm64' | 'x64'

export function parseWindowsReleaseArguments(args: string[]): { arch: WindowsReleaseArch } {
  const { values } = parseArgs({
    args,
    options: { arch: { type: 'string' } },
  })
  if (values.arch === 'arm64' || values.arch === 'x64') return { arch: values.arch }
  throw new Error('--arch must be x64 or arm64')
}

export function expectedWindowsArtifactName(version: string, arch: WindowsReleaseArch): string {
  return `${APP_NAME}-${version}-${arch}.exe`
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: packageRoot, stdio: 'inherit' })
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
  if (process.platform !== 'win32') {
    throw new Error('Windows release artifacts must be built on a Windows runner.')
  }

  const { arch } = parseWindowsReleaseArguments(process.argv.slice(2))
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
    throw new Error(`package.json version must be semver-like, got ${JSON.stringify(packageJson.version)}.`)
  }

  process.chdir(packageRoot)
  const releaseDir = path.join(packageRoot, 'release')
  rmSync(releaseDir, { recursive: true, force: true })

  const viteCli = path.join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const electronBuilderCli = path.join(packageRoot, 'node_modules', 'electron-builder', 'cli.js')
  await run(process.execPath, [viteCli, 'build'])

  for (const relativePath of ['dist/web/index.html', 'dist/web/boot.js']) {
    if (!existsSync(path.join(packageRoot, relativePath))) {
      throw new Error(`expected build artifact missing: ${relativePath}`)
    }
  }

  const archFlag = arch === 'arm64' ? '--arm64' : '--x64'
  await run(process.execPath, [electronBuilderCli, '--win', 'nsis', archFlag, '--publish', 'never'])

  const artifactName = expectedWindowsArtifactName(packageJson.version, arch)
  const artifactPath = path.join(releaseDir, artifactName)
  if (!existsSync(artifactPath)) {
    throw new Error(`expected Windows release artifact missing: ${path.relative(packageRoot, artifactPath)}`)
  }
  console.log(`Built Windows release artifact: ${path.relative(packageRoot, artifactPath)}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
