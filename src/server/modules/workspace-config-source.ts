import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'
import {
  REMOTE_WORKSPACE_CONFIG_CONTENT_MARKER,
  REMOTE_WORKSPACE_CONFIG_MISSING_MARKER,
  runRemoteCommand,
} from '#/system/ssh/commands.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { isWorkspaceRepositoryName, type WorkspaceConfig, type WorkspaceConfigSnapshot } from '#/shared/workspace.ts'

const configFileName = 'goblin.toml'
const workspaceHeader = /^\s*\[workspace\]\s*(?:#.*)?$/
const tableHeader = /^\s*\[\[?[^\]]+\]?\]\s*(?:#.*)?$/

interface WorkspaceConfigSourceDependencies {
  runRemote?: typeof runRemoteCommand
  resolveRemoteTarget?: typeof resolveSshRemoteTarget
  randomId?: () => string
}

type WorkspaceConfigContents =
  | { kind: 'missing' }
  | { kind: 'ready'; raw: string }
  | { kind: 'invalid'; message: string }

export function normalizeWorkspaceConfig(value: unknown): WorkspaceConfig {
  const record = asRecord(value)
  if (!record) throw new Error('workspace.config.must-be-table')
  if (!Array.isArray(record.repo) || record.repo.length === 0) {
    throw new Error('workspace.config.empty-repositories')
  }

  const repositories: string[] = []
  const seen = new Set<string>()
  for (const member of record.repo) {
    if (!isWorkspaceRepositoryName(member)) throw new Error('workspace.config.invalid-repository')
    if (seen.has(member)) throw new Error('workspace.config.duplicate-repository')
    seen.add(member)
    repositories.push(member)
  }
  return { repo: repositories }
}

export async function readWorkspaceConfig(
  rootId: string,
  dependencies: WorkspaceConfigSourceDependencies = {},
): Promise<WorkspaceConfigSnapshot> {
  const contents = await readWorkspaceConfigContents(rootId, dependencies)
  if (contents.kind !== 'ready') return contents
  return parseWorkspaceConfig(contents.raw)
}

async function readWorkspaceConfigContents(
  rootId: string,
  dependencies: WorkspaceConfigSourceDependencies,
): Promise<WorkspaceConfigContents> {
  if (isRemoteRepoId(rootId)) return await readRemoteWorkspaceConfigContents(rootId, dependencies)
  try {
    return { kind: 'ready', raw: await readFile(path.join(rootId, configFileName), 'utf8') }
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { kind: 'missing' }
    return { kind: 'invalid', message: 'workspace.config.read-failed' }
  }
}

function parseWorkspaceConfig(raw: string): WorkspaceConfigSnapshot {
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch {
    return { kind: 'invalid', message: 'workspace.config.invalid-toml' }
  }
  const root = asRecord(parsed)
  if (!root || root.workspace === undefined) return { kind: 'missing' }
  try {
    return { kind: 'ready', config: normalizeWorkspaceConfig(root.workspace) }
  } catch (error) {
    return { kind: 'invalid', message: errorMessage(error) }
  }
}

export async function writeWorkspaceConfig(
  rootId: string,
  config: WorkspaceConfig,
  dependencies: WorkspaceConfigSourceDependencies = {},
): Promise<void> {
  const normalized = normalizeWorkspaceConfig(config)
  const contents = await readWorkspaceConfigContents(rootId, dependencies)
  if (contents.kind === 'invalid') throw new Error(contents.message)
  const raw = contents.kind === 'ready' ? contents.raw : ''

  if (raw) {
    try {
      parse(raw)
    } catch {
      throw new Error('workspace.config.invalid-toml')
    }
  }

  const updated = upsertWorkspaceTable(raw, normalized)
  if (isRemoteRepoId(rootId)) {
    await writeRemoteWorkspaceConfig(rootId, updated, dependencies)
    return
  }

  const configPath = path.join(rootId, configFileName)
  const temporaryPath = path.join(rootId, `.${configFileName}.${dependencies.randomId?.() ?? randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, updated, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, configPath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

export function upsertWorkspaceTable(raw: string, config: WorkspaceConfig): string {
  const table = serializeWorkspaceTable(normalizeWorkspaceConfig(config))
  const lines = raw.split('\n')
  const start = lines.findIndex((line) => workspaceHeader.test(line))
  if (start < 0) {
    const prefix = raw.length === 0 ? '' : raw.endsWith('\n') ? `${raw}\n` : `${raw}\n\n`
    return `${prefix}${table}\n`
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (tableHeader.test(lines[index] ?? '')) {
      end = index
      break
    }
  }
  const before = lines.slice(0, start)
  const after = lines.slice(end)
  return [...before, table, ...after].join('\n')
}

function serializeWorkspaceTable(config: WorkspaceConfig): string {
  return `[workspace]\nrepo = [${config.repo.map((member) => JSON.stringify(member)).join(', ')}]`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'workspace.config.invalid'
}

async function readRemoteWorkspaceConfigContents(
  rootId: string,
  dependencies: WorkspaceConfigSourceDependencies,
): Promise<WorkspaceConfigContents> {
  const parsed = parseRemoteRepoId(rootId)
  if (!parsed) return { kind: 'invalid', message: 'workspace.config.read-failed' }
  try {
    const resolved = await (dependencies.resolveRemoteTarget ?? resolveSshRemoteTarget)(parsed)
    const result = await (dependencies.runRemote ?? runRemoteCommand)(resolved.target, {
      type: 'readWorkspaceConfig',
      rootPath: parsed.remotePath,
    })
    if (!result.ok) return { kind: 'invalid', message: 'workspace.config.read-failed' }
    if (result.stdout === REMOTE_WORKSPACE_CONFIG_MISSING_MARKER) return { kind: 'missing' }
    if (result.stdout === REMOTE_WORKSPACE_CONFIG_CONTENT_MARKER) return { kind: 'ready', raw: '' }
    const prefix = `${REMOTE_WORKSPACE_CONFIG_CONTENT_MARKER}\n`
    if (!result.stdout.startsWith(prefix)) return { kind: 'invalid', message: 'workspace.config.read-failed' }
    return { kind: 'ready', raw: result.stdout.slice(prefix.length) }
  } catch (error) {
    return { kind: 'invalid', message: remoteWorkspaceErrorMessage(error, 'workspace.config.read-failed') }
  }
}

async function writeRemoteWorkspaceConfig(
  rootId: string,
  contents: string,
  dependencies: WorkspaceConfigSourceDependencies,
): Promise<void> {
  const parsed = parseRemoteRepoId(rootId)
  if (!parsed) throw new Error('workspace.config.write-failed')
  try {
    const resolved = await (dependencies.resolveRemoteTarget ?? resolveSshRemoteTarget)(parsed)
    const temporaryName = `.${configFileName}.${dependencies.randomId?.() ?? randomUUID()}.tmp`
    const result = await (dependencies.runRemote ?? runRemoteCommand)(
      resolved.target,
      { type: 'writeWorkspaceConfig', rootPath: parsed.remotePath, temporaryName },
      { stdin: contents },
    )
    if (!result.ok) throw new Error('workspace.config.write-failed')
  } catch (error) {
    throw new Error(remoteWorkspaceErrorMessage(error, 'workspace.config.write-failed'))
  }
}

function remoteWorkspaceErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === 'error.ssh-config-changed' ? error.message : fallback
}
