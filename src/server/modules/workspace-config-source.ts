import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'
import type { WorkspaceConfig, WorkspaceConfigSnapshot } from '#/shared/workspace.ts'

const configFileName = 'goblin.toml'
const workspaceHeader = /^\s*\[workspace\]\s*(?:#.*)?$/
const tableHeader = /^\s*\[\[?[^\]]+\]?\]\s*(?:#.*)?$/

export function normalizeWorkspaceConfig(value: unknown): WorkspaceConfig {
  const record = asRecord(value)
  if (!record) throw new Error('workspace.config.must-be-table')
  if (!Array.isArray(record.repo) || record.repo.length === 0) {
    throw new Error('workspace.config.empty-repositories')
  }

  const repositories: string[] = []
  const seen = new Set<string>()
  for (const member of record.repo) {
    if (!isSafeChildName(member)) throw new Error('workspace.config.invalid-repository')
    if (seen.has(member)) throw new Error('workspace.config.duplicate-repository')
    seen.add(member)
    repositories.push(member)
  }
  return { repo: repositories }
}

export async function readWorkspaceConfig(rootId: string): Promise<WorkspaceConfigSnapshot> {
  let raw: string
  try {
    raw = await readFile(path.join(rootId, configFileName), 'utf8')
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { kind: 'missing' }
    return { kind: 'invalid', message: 'workspace.config.read-failed' }
  }

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

export async function writeWorkspaceConfig(rootId: string, config: WorkspaceConfig): Promise<void> {
  const normalized = normalizeWorkspaceConfig(config)
  const configPath = path.join(rootId, configFileName)
  let raw = ''
  try {
    raw = await readFile(configPath, 'utf8')
  } catch (error) {
    if (!isErrno(error, 'ENOENT')) throw new Error('workspace.config.read-failed')
  }

  if (raw) {
    try {
      parse(raw)
    } catch {
      throw new Error('workspace.config.invalid-toml')
    }
  }

  const updated = upsertWorkspaceTable(raw, normalized)
  const temporaryPath = path.join(rootId, `.${configFileName}.${randomUUID()}.tmp`)
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

function isSafeChildName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  )
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
