import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { isWorkspaceRepositoryName, type WorkspaceConfig, type WorkspaceConfigSnapshot } from '#/shared/workspace.ts'

const registryFileName = 'workspace-configs.json'

interface WorkspaceConfigSourceDependencies {
  dataFile?: string
  randomId?: () => string
}

interface PersistedWorkspaceConfig {
  rootId: string
  repo: string[]
}

interface WorkspaceConfigRegistry {
  version: 1
  workspaces: PersistedWorkspaceConfig[]
}

type WorkspaceConfigRegistrySnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; registry: WorkspaceConfigRegistry }
  | { kind: 'invalid' }

const writeQueues = new Map<string, Promise<void>>()

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
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await writeQueues.get(dataFile)?.catch(() => undefined)
  const snapshot = await readRegistry(dataFile)
  if (snapshot.kind === 'missing') return snapshot
  if (snapshot.kind === 'invalid') return { kind: 'invalid', message: 'workspace.config.read-failed' }

  const normalizedRootId = workspaceRootId(rootId)
  const persisted = snapshot.registry.workspaces.find((workspace) => workspace.rootId === normalizedRootId)
  return persisted ? { kind: 'ready', config: { repo: [...persisted.repo] } } : { kind: 'missing' }
}

export async function writeWorkspaceConfig(
  rootId: string,
  config: WorkspaceConfig,
  dependencies: WorkspaceConfigSourceDependencies = {},
): Promise<void> {
  const normalizedRootId = workspaceRootId(rootId)
  const normalizedConfig = normalizeWorkspaceConfig(config)
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)

  await enqueueWrite(dataFile, async () => {
    const snapshot = await readRegistry(dataFile)
    if (snapshot.kind === 'invalid') throw new Error('workspace.config.read-failed')
    const registry: WorkspaceConfigRegistry =
      snapshot.kind === 'ready' ? snapshot.registry : { version: 1, workspaces: [] }
    const workspaces = registry.workspaces.map((workspace) => ({
      rootId: workspace.rootId,
      repo: [...workspace.repo],
    }))
    const existingIndex = workspaces.findIndex((workspace) => workspace.rootId === normalizedRootId)
    const persisted = { rootId: normalizedRootId, repo: [...normalizedConfig.repo] }
    if (existingIndex >= 0) workspaces[existingIndex] = persisted
    else workspaces.push(persisted)

    await writeRegistry(dataFile, { version: 1, workspaces }, dependencies.randomId?.() ?? randomUUID())
  })
}

async function readRegistry(dataFile: string): Promise<WorkspaceConfigRegistrySnapshot> {
  let raw: string
  try {
    raw = await readFile(dataFile, 'utf8')
  } catch (error) {
    return isErrno(error, 'ENOENT') ? { kind: 'missing' } : { kind: 'invalid' }
  }

  try {
    return { kind: 'ready', registry: normalizeRegistry(JSON.parse(raw)) }
  } catch {
    return { kind: 'invalid' }
  }
}

function normalizeRegistry(value: unknown): WorkspaceConfigRegistry {
  const record = asRecord(value)
  if (!record || record.version !== 1 || !Array.isArray(record.workspaces)) {
    throw new Error('workspace.config.read-failed')
  }

  const workspaces: PersistedWorkspaceConfig[] = []
  const seen = new Set<string>()
  for (const value of record.workspaces) {
    const workspace = asRecord(value)
    if (!workspace || typeof workspace.rootId !== 'string' || workspace.rootId.trim() !== workspace.rootId) {
      throw new Error('workspace.config.read-failed')
    }
    const normalizedRootId = workspaceRootId(workspace.rootId)
    if (workspace.rootId.length === 0 || normalizedRootId !== workspace.rootId || seen.has(normalizedRootId)) {
      throw new Error('workspace.config.read-failed')
    }
    const config = normalizeWorkspaceConfig({ repo: workspace.repo })
    seen.add(normalizedRootId)
    workspaces.push({ rootId: normalizedRootId, repo: config.repo })
  }
  return { version: 1, workspaces }
}

async function writeRegistry(dataFile: string, registry: WorkspaceConfigRegistry, randomId: string): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true })
  const temporaryFile = path.join(path.dirname(dataFile), `.${path.basename(dataFile)}.${randomId}.tmp`)
  let temporaryFileCreated = false
  try {
    await writeFile(temporaryFile, `${JSON.stringify(registry, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    temporaryFileCreated = true
    await rename(temporaryFile, dataFile)
    temporaryFileCreated = false
  } catch (error) {
    if (temporaryFileCreated) await unlink(temporaryFile).catch(() => undefined)
    throw error
  }
}

async function enqueueWrite(dataFile: string, write: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(dataFile) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(write)
  writeQueues.set(dataFile, operation)
  try {
    await operation
  } finally {
    if (writeQueues.get(dataFile) === operation) writeQueues.delete(dataFile)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
