#!/usr/bin/env node
// Build the source archive used to deploy Hobgoblin Server Mode on Linux.
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const repoRoot = path.resolve(import.meta.dirname, '..')

const INCLUDE_PATHS = [
  'README.md',
  'README.zh-CN.md',
  'README.ja.md',
  'README.ko.md',
  'THIRD_PARTY_NOTICES.md',
  'bun.lock',
  'package.json',
  'tsconfig.json',
  'tsconfig.main.json',
  'tsconfig.web.json',
  'vite.config.ts',
  'serve.sh',
  'scripts/start-server.ts',
  'scripts/serve-systemd.sh',
  'assets',
  'LICENSES',
  'src/server',
  'src/shared',
  'src/system',
  'src/web',
] as const

const REQUIRED_FILES = [
  'package.json',
  'bun.lock',
  'vite.config.ts',
  'scripts/start-server.ts',
  'scripts/serve-systemd.sh',
  'src/server/bootstrap.ts',
  'src/system/git/helper.ts',
  'src/web/index.html',
] as const

function fail(message: string): never {
  throw new Error(message)
}

function isTestOnlyPath(relativePath: string): boolean {
  return /(?:^|\/)__snapshots__(?:\/|$)/.test(relativePath) || /\.(?:test|spec)\.(?:ts|tsx)$/.test(relativePath)
}

function readVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  const version = typeof packageJson.version === 'string' ? packageJson.version : ''
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Invalid package.json version: ${JSON.stringify(packageJson.version)}`)
  }
  return version
}

function trackedDeploymentFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z', '--', ...INCLUDE_PATHS], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const files = output
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => !isTestOnlyPath(relativePath))
    // git ls-files still reports tracked entries deleted only in the working tree.
    .filter(
      (relativePath) =>
        lstatSync(path.join(repoRoot, relativePath), { throwIfNoEntry: false }) !== undefined,
    )
    .sort()

  if (files.length === 0) fail('No tracked Linux deployment source files found.')

  const selected = new Set(files)
  for (const requiredFile of REQUIRED_FILES) {
    if (!selected.has(requiredFile)) fail(`Required Linux deployment source file is missing: ${requiredFile}`)
  }
  return files
}

function copyTrackedFile(relativePath: string, archiveRoot: string): void {
  const source = path.join(repoRoot, relativePath)
  const destination = path.join(archiveRoot, relativePath)
  const sourceStats = lstatSync(source)

  mkdirSync(path.dirname(destination), { recursive: true })
  cpSync(source, destination, { dereference: false, preserveTimestamps: true })
  if (!sourceStats.isSymbolicLink()) chmodSync(destination, sourceStats.mode)
}

function buildArchive(outputDir: string): string {
  const version = readVersion()
  const rootName = `Hobgoblin-${version}`
  const archiveName = `${rootName}-linux-source.tar.gz`
  const resolvedOutputDir = path.resolve(repoRoot, outputDir)
  const archivePath = path.join(resolvedOutputDir, archiveName)
  const stagingDir = mkdtempSync(path.join(tmpdir(), 'hobgoblin-linux-source-'))
  const archiveRoot = path.join(stagingDir, rootName)

  try {
    mkdirSync(archiveRoot, { recursive: true })
    for (const relativePath of trackedDeploymentFiles()) copyTrackedFile(relativePath, archiveRoot)

    mkdirSync(resolvedOutputDir, { recursive: true })
    execFileSync('tar', ['-czf', archivePath, '-C', stagingDir, rootName], { stdio: 'inherit' })
    if (!existsSync(archivePath) || statSync(archivePath).size === 0) {
      fail(`Linux source archive was not created: ${archivePath}`)
    }
    return archivePath
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

const { values } = parseArgs({
  options: {
    'output-dir': { type: 'string', default: 'release' },
  },
  strict: true,
})

try {
  const archivePath = buildArchive(values['output-dir'])
  console.log(`Built Linux source deployment archive: ${path.relative(repoRoot, archivePath)}`)
} catch (error) {
  console.error(error instanceof Error ? `Error: ${error.message}` : error)
  process.exitCode = 1
}
