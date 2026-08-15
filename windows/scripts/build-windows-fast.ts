#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

export const NPM_MIRROR_ELECTRON = 'https://npmmirror.com/mirrors/electron/'
export const NPM_MIRROR_BINARIES = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

type BuildArch = 'x64' | 'arm64'

export interface FastWindowsBuildOptions {
  arch: BuildArch
  full: boolean
  output: string
  proxy: string
}

interface FastWindowsBuildPlanInput {
  electronVersion: string
  hostArch?: string
  localElectronDist: string
  localElectronVersion: string | null
  options: FastWindowsBuildOptions
  repoRoot: string
}

export interface FastWindowsBuildPlan {
  builderArgs: string[]
  environment: Record<string, string>
  outputDir: string
  runTypecheck: boolean
  usesLocalElectron: boolean
}

const USAGE = `Usage: bun run build:win:fast -- [options]

Build the Windows NSIS installer with the local Electron distribution when
available. Download fallbacks use npmmirror and the configured proxy.

  --proxy=URL       Proxy URL (default: http://127.0.0.1:7890)
  --x64             Build x64 (default)
  --arm64           Build arm64
  --output=DIR      Output directory (default: release-win-fast)
  --full            Run typecheck and electron-builder native rebuilds
  -h, --help        Show this help
`

export function parseFastWindowsBuildArgs(args: string[]): FastWindowsBuildOptions {
  const options = {
    proxy: { type: 'string' as const },
    x64: { type: 'boolean' as const },
    arm64: { type: 'boolean' as const },
    output: { type: 'string' as const },
    full: { type: 'boolean' as const },
    help: { type: 'boolean' as const, short: 'h' as const },
  }
  const { values } = parseArgs({ args, options, strict: true })

  if (values.help) {
    process.stdout.write(USAGE)
    process.exit(0)
  }
  if (values.x64 && values.arm64) {
    throw new Error('Choose only one architecture: --x64 or --arm64')
  }

  const proxy = values.proxy?.trim() || 'http://127.0.0.1:7890'
  const proxyUrl = new URL(proxy)
  if (!['http:', 'https:', 'socks:', 'socks5:'].includes(proxyUrl.protocol)) {
    throw new Error(`Unsupported proxy protocol: ${proxyUrl.protocol}`)
  }

  const output = values.output?.trim() || 'release-win-fast'
  if (path.isAbsolute(output) || path.dirname(output) !== '.' || !output.startsWith('release-')) {
    throw new Error('--output must be a direct child directory named release-*')
  }

  return {
    arch: values.arm64 ? 'arm64' : 'x64',
    full: values.full === true,
    output,
    proxy,
  }
}

export function createFastWindowsBuildPlan(input: FastWindowsBuildPlanInput): FastWindowsBuildPlan {
  const outputDir = path.resolve(input.repoRoot, input.options.output)
  const relativeOutput = path.relative(input.repoRoot, outputDir)
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput) || relativeOutput === '') {
    throw new Error('Build output must be a child directory of the repository root')
  }

  const usesLocalElectron =
    input.localElectronVersion === input.electronVersion &&
    (input.hostArch ?? process.arch) === input.options.arch
  const builderArgs = [
    '--win',
    'nsis',
    `--${input.options.arch}`,
    `--config.directories.output=${input.options.output}`,
  ]
  if (!input.options.full) builderArgs.push('--config.npmRebuild=false')
  if (usesLocalElectron) builderArgs.push(`--config.electronDist=${input.localElectronDist}`)

  const proxy = input.options.proxy
  return {
    builderArgs,
    environment: {
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_BINARIES_MIRROR: NPM_MIRROR_BINARIES,
      ELECTRON_GET_USE_PROXY: 'true',
      ELECTRON_MIRROR: NPM_MIRROR_ELECTRON,
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      https_proxy: proxy,
      http_proxy: proxy,
      npm_config_https_proxy: proxy,
      npm_config_proxy: proxy,
    },
    outputDir,
    runTypecheck: input.options.full,
    usesLocalElectron,
  }
}

function run(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const startedAt = Date.now()
  console.log(`\n[fast-build] ${label}`)
  const result = spawnSync(command, args, {
    cwd: path.resolve(import.meta.dirname, '..'),
    env,
    stdio: 'inherit',
  })
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1} after ${seconds}s`)
  }
  console.log(`[fast-build] ${label} completed in ${seconds}s`)
}

function readLocalElectronVersion(localElectronDist: string): string | null {
  const versionFile = path.join(localElectronDist, 'version')
  const executable = path.join(localElectronDist, 'electron.exe')
  if (!existsSync(versionFile) || !existsSync(executable)) return null
  return readFileSync(versionFile, 'utf8').trim()
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('build:win:fast must run on Windows')
  }

  const repoRoot = path.resolve(import.meta.dirname, '..')
  const options = parseFastWindowsBuildArgs(process.argv.slice(2))
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    productName: string
    version: string
    devDependencies: Record<string, string>
  }
  const electronVersion = packageJson.devDependencies.electron.replace(/^[~^]/, '')
  const localElectronDist = path.join(repoRoot, 'node_modules', 'electron', 'dist')
  const plan = createFastWindowsBuildPlan({
    electronVersion,
    localElectronDist,
    localElectronVersion: readLocalElectronVersion(localElectronDist),
    options,
    repoRoot,
  })
  const env = { ...process.env, ...plan.environment }

  console.log(`[fast-build] proxy: ${options.proxy}`)
  console.log(`[fast-build] electron mirror: ${NPM_MIRROR_ELECTRON}`)
  console.log(`[fast-build] binaries mirror: ${NPM_MIRROR_BINARIES}`)
  console.log(
    plan.usesLocalElectron
      ? `[fast-build] reusing local Electron ${electronVersion}: ${localElectronDist}`
      : `[fast-build] local Electron unavailable; Electron ${electronVersion} will download through npmmirror`,
  )

  rmSync(plan.outputDir, { recursive: true, force: true })
  if (plan.runTypecheck) run('typecheck', process.execPath, ['run', 'typecheck'], env)
  run('web build', process.execPath, ['run', 'build:web'], env)
  run('Windows NSIS package', process.execPath, ['run', 'build:electron', '--', ...plan.builderArgs], env)

  const artifact = path.join(
    plan.outputDir,
    `${packageJson.productName}-${packageJson.version}-${options.arch}.exe`,
  )
  if (!existsSync(artifact)) throw new Error(`Expected installer was not created: ${artifact}`)

  const hash = createHash('sha256').update(readFileSync(artifact)).digest('hex')
  const sizeMiB = (statSync(artifact).size / 1024 / 1024).toFixed(1)
  console.log(`\n[fast-build] installer: ${artifact}`)
  console.log(`[fast-build] size: ${sizeMiB} MiB`)
  console.log(`[fast-build] sha256: ${hash}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[fast-build] ${message}`)
    process.exitCode = 1
  })
}
