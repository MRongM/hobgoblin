import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { enqueueFileWrite, writeJsonRegistryAtomically } from '#/server/modules/queued-json-registry.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { isWorkspaceRepositoryName, type WorkspaceConfig, type WorkspaceConfigSnapshot } from '#/shared/workspace.ts'
import type { WorkspaceRecoveryCleanupScope } from '#/shared/workspace-recovery.ts'

const registryFileName = 'workspace-configs.json'

export interface WorkspaceConfigSourceDependencies {
  dataFile?: string
  randomId?: () => string
}

export interface WorkspaceConfigCleanupPlan {
  rootId: string
  scope: WorkspaceRecoveryCleanupScope
  fingerprint: string
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

  await enqueueFileWrite(writeQueues, dataFile, async () => {
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

    await writeJsonRegistryAtomically(
      dataFile,
      { version: 1, workspaces },
      dependencies.randomId?.() ?? randomUUID(),
    )
  })
}

export async function inspectWorkspaceConfigCleanup(
  rootId: string,
  dependencies: WorkspaceConfigSourceDependencies = {},
): Promise<WorkspaceConfigCleanupPlan> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await writeQueues.get(dataFile)?.catch(() => undefined)
  const raw = await readRawRegistry(dataFile)
  return {
    rootId: workspaceRootId(rootId),
    scope: raw.kind === 'missing' ? 'project' : inspectRawRegistry(raw.text).scope,
    fingerprint: rawRegistryFingerprint(raw),
  }
}

export async function cleanupWorkspaceConfig(
  plan: WorkspaceConfigCleanupPlan,
  dependencies: WorkspaceConfigSourceDependencies = {},
): Promise<void> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  const normalizedRootId = workspaceRootId(plan.rootId)
  if (normalizedRootId !== plan.rootId) throw new Error('workspace.recovery.plan-stale')

  await enqueueFileWrite(writeQueues, dataFile, async () => {
    const raw = await readRawRegistry(dataFile)
    if (rawRegistryFingerprint(raw) !== plan.fingerprint) throw new Error('workspace.recovery.plan-stale')
    if (raw.kind === 'missing') {
      if (plan.scope !== 'project') throw new Error('workspace.recovery.plan-stale')
      return
    }

    const inspected = inspectRawRegistry(raw.text)
    if (inspected.scope !== plan.scope) throw new Error('workspace.recovery.plan-stale')
    const nextRegistry =
      inspected.scope === 'registry-reset'
        ? emptyWorkspaceConfigRegistry()
        : {
            version: 1 as const,
            workspaces: inspected.registry.workspaces.filter((workspace) => workspace.rootId !== normalizedRootId),
          }
    const currentCount = inspected.scope === 'registry-reset' ? -1 : inspected.registry.workspaces.length
    if (plan.scope === 'project' && nextRegistry.workspaces.length === currentCount) return
    await writeJsonRegistryAtomically(dataFile, nextRegistry, dependencies.randomId?.() ?? randomUUID())
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

type RawWorkspaceConfigRegistry = { kind: 'missing' } | { kind: 'ready'; bytes: Uint8Array; text: string }

async function readRawRegistry(dataFile: string): Promise<RawWorkspaceConfigRegistry> {
  try {
    const bytes = await readFile(dataFile)
    return { kind: 'ready', bytes, text: bytes.toString('utf8') }
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { kind: 'missing' }
    throw new Error('workspace.config.read-failed')
  }
}

function rawRegistryFingerprint(snapshot: RawWorkspaceConfigRegistry): string {
  const bytes = snapshot.kind === 'ready' ? snapshot.bytes : '<missing>'
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

type WorkspaceConfigRegistryInspection =
  | { scope: 'project'; registry: WorkspaceConfigRegistry }
  | { scope: 'registry-repair'; registry: WorkspaceConfigRegistry }
  | { scope: 'registry-reset' }

function inspectRawRegistry(raw: string): WorkspaceConfigRegistryInspection {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { scope: 'registry-reset' }
  }
  try {
    return { scope: 'project', registry: normalizeRegistry(parsed) }
  } catch {
    const recovered = recoverWorkspaceConfigRegistry(parsed)
    return recovered ? { scope: 'registry-repair', registry: recovered } : { scope: 'registry-reset' }
  }
}

function recoverWorkspaceConfigRegistry(value: unknown): WorkspaceConfigRegistry | null {
  const record = asRecord(value)
  if (!record || record.version !== 1 || !Array.isArray(record.workspaces)) return null

  const workspaces: PersistedWorkspaceConfig[] = []
  const seen = new Set<string>()
  for (const value of record.workspaces) {
    const workspace = asRecord(value)
    if (!workspace || typeof workspace.rootId !== 'string' || workspace.rootId.trim() !== workspace.rootId) continue
    const normalizedRootId = workspaceRootId(workspace.rootId)
    if (!workspace.rootId || normalizedRootId !== workspace.rootId || seen.has(normalizedRootId)) continue
    try {
      const config = normalizeWorkspaceConfig({ repo: workspace.repo })
      seen.add(normalizedRootId)
      workspaces.push({ rootId: normalizedRootId, repo: config.repo })
    } catch {}
  }
  return { version: 1, workspaces }
}

function emptyWorkspaceConfigRegistry(): WorkspaceConfigRegistry {
  return { version: 1, workspaces: [] }
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
