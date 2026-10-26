import { randomUUID } from 'node:crypto'
import { access, link, open, readFile, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { constants } from 'node:fs'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { enqueueFileWrite, writeJsonRegistryAtomically } from '#/server/modules/queued-json-registry.ts'
import { workspaceRootId } from '#/server/modules/workspace-paths.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'
import type { BranchWorkspaceManifest, BranchWorkspaceRegistryCleanupResult } from '#/shared/branch-workspaces.ts'

const registryFileName = 'branch-workspaces.json'
const invalidRegistryMessage = 'workspace.branch-workspace.read-failed'

export type BranchWorkspaceManifestSourceSnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; manifests: BranchWorkspaceManifest[] }
  | { kind: 'invalid'; message: string }

export interface BranchWorkspaceSourceDependencies {
  dataFile?: string
  randomId?: () => string
}

interface FolderRegistration {
  id: string
  path: string
}
interface FolderGroup {
  rootId: string
  branchWorkspaces: FolderRegistration[]
}
interface FolderRegistry {
  version: 1 | 2 | 3
  workspaces: FolderGroup[]
}
type RegistrySnapshot = { kind: 'missing' } | { kind: 'ready'; registry: FolderRegistry } | { kind: 'invalid' }
const writeQueues = new Map<string, Promise<void>>()
// Optional app creation helpers may retain progress during this process. It is never serialized.
const executionByFile = new Map<string, Map<string, BranchWorkspaceManifest[]>>()

export async function readBranchWorkspaceManifests(
  rootId: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceManifestSourceSnapshot> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await writeQueues.get(dataFile)?.catch(() => undefined)
  const snapshot = await readRegistry(dataFile)
  if (snapshot.kind !== 'ready')
    return snapshot.kind === 'invalid' ? { kind: 'invalid', message: invalidRegistryMessage } : snapshot
  const root = workspaceRootId(rootId)
  const group = snapshot.registry.workspaces.find((entry) => entry.rootId === root)
  if (!group) return { kind: 'missing' }
  return { kind: 'ready', manifests: projectGroup(group) }
}

/** Process-only helper state; normal persistence/catalog reads never expose this roster. */
export async function readBranchWorkspaceExecutionManifests(
  rootId: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceManifestSourceSnapshot> {
  const snapshot = await readBranchWorkspaceManifests(rootId, dependencies)
  if (snapshot.kind !== 'ready') return snapshot
  const root = workspaceRootId(rootId),
    dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  return {
    kind: 'ready',
    manifests: projectGroup(
      { rootId: root, branchWorkspaces: snapshot.manifests.map(({ id, path }) => ({ id, path })) },
      executionByFile.get(dataFile)?.get(root),
    ),
  }
}

export async function readAllBranchWorkspaceManifests(
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceManifestSourceSnapshot> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await writeQueues.get(dataFile)?.catch(() => undefined)
  const snapshot = await readRegistry(dataFile)
  if (snapshot.kind !== 'ready')
    return snapshot.kind === 'invalid' ? { kind: 'invalid', message: invalidRegistryMessage } : snapshot
  return { kind: 'ready', manifests: snapshot.registry.workspaces.flatMap((group) => projectGroup(group)) }
}

/** Record a readable folder location. No repository adoption, checkout, marker or file mutation. */
export async function registerBranchWorkspaceFolder(
  rootId: string,
  folderPath: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<{ branchWorkspaceId: string }> {
  const root = workspaceRootId(rootId)
  const normalizedPath = normalizeFolderPath(root, folderPath)
  const remote = parseRemoteRepoId(root)
  if (remote) {
    const { target } = await resolveRepositoryRemoteTarget(remote)
    const result = await runRemoteCommand(target, { type: 'validateBranchWorkspaceFolder', path: normalizedPath })
    if (!result.ok) throw new Error('workspace.branch-workspace.directory-unavailable')
  } else {
    try {
      if (!(await stat(normalizedPath)).isDirectory()) throw new Error('not-directory')
      await access(normalizedPath, constants.R_OK | constants.X_OK)
      await readdir(normalizedPath)
    } catch {
      throw new Error('workspace.branch-workspace.directory-unavailable')
    }
  }
  let branchWorkspaceId = ''
  await updateBranchWorkspaceManifests(
    root,
    (manifests) => {
      const existing = manifests.find((manifest) => sameFolderPath(root, manifest.path, normalizedPath))
      if (existing) {
        branchWorkspaceId = existing.id
        return manifests
      }
      branchWorkspaceId = `branch-workspace:${dependencies.randomId?.() ?? randomUUID()}`
      return [...manifests, folderManifest(root, { id: branchWorkspaceId, path: normalizedPath })]
    },
    dependencies,
  )
  return { branchWorkspaceId }
}

/** Forget only the application record. Files, Git branches, worktrees and terminals are untouched. */
export async function unregisterBranchWorkspaceFolder(
  rootId: string,
  branchWorkspaceId: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  await discardBranchWorkspaceRecords(rootId, [branchWorkspaceId], dependencies)
}

/** Update all same-host folder locations after a physical rename, keeping IDs and ordering. */
export async function relocateBranchWorkspaceFolderRecords(
  rootId: string,
  branchWorkspaceId: string,
  previousPath: string,
  nextPath: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
  additionalMappings: Array<{ previousPath: string; path: string }> = [],
): Promise<string[]> {
  const root = workspaceRootId(rootId)
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  const affectedRootIds: string[] = []
  await enqueueFileWrite(writeQueues, dataFile, async () => {
    const snapshot = await readRegistry(dataFile)
    if (snapshot.kind !== 'ready') throw new Error(invalidRegistryMessage)
    const owner = snapshot.registry.workspaces.find((group) => group.rootId === root)
    const registration = owner?.branchWorkspaces.find((entry) => entry.id === branchWorkspaceId)
    if (!registration || !sameFolderPath(root, registration.path, previousPath))
      throw new Error('workspace.branch-workspace.plan-stale')
    const remote = parseRemoteRepoId(root)
    const pathApi = remote ? path.posix : path
    const groups = snapshot.registry.workspaces.map((group) => {
      const candidateRemote = parseRemoteRepoId(group.rootId)
      if (
        remote
          ? !candidateRemote || candidateRemote.alias !== remote.alias || candidateRemote.transport !== remote.transport
          : candidateRemote
      )
        return group
      let changed = false
      const branchWorkspaces = group.branchWorkspaces.map((entry) => {
        for (const mapping of [{ previousPath, path: nextPath }, ...additionalMappings]) {
          const relative = pathApi.relative(mapping.previousPath, entry.path)
          if (relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) continue
          changed = true
          return { id: entry.id, path: pathApi.join(mapping.path, relative) }
        }
        return entry
      })
      if (!changed) return group
      affectedRootIds.push(group.rootId)
      return { ...group, branchWorkspaces: normalizeRegistrations(branchWorkspaces, group.rootId) }
    })
    await backupLegacyRegistry(dataFile, snapshot.registry)
    await writeJsonRegistryAtomically(
      dataFile,
      { version: 3, workspaces: groups },
      dependencies.randomId?.() ?? randomUUID(),
    )
    for (const affectedRoot of affectedRootIds) executionByFile.get(dataFile)?.delete(affectedRoot)
  })
  return affectedRootIds
}

export async function replaceBranchWorkspaceManifests(
  rootId: string,
  manifests: BranchWorkspaceManifest[],
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  await updateBranchWorkspaceManifests(rootId, () => manifests, dependencies)
}

export async function updateBranchWorkspaceManifests(
  rootId: string,
  mutate: (manifests: BranchWorkspaceManifest[]) => BranchWorkspaceManifest[] | Promise<BranchWorkspaceManifest[]>,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  const root = workspaceRootId(rootId)
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await enqueueFileWrite(writeQueues, dataFile, async () => {
    const snapshot = await readRegistry(dataFile)
    if (snapshot.kind === 'invalid') throw new Error(invalidRegistryMessage)
    const registry: FolderRegistry = snapshot.kind === 'ready' ? snapshot.registry : { version: 3, workspaces: [] }
    const existing = registry.workspaces.find((group) => group.rootId === root)
    const current = existing ? projectGroup(existing, executionByFile.get(dataFile)?.get(root)) : []
    const next = await mutate(cloneManifests(current))
    const registrations = normalizeRegistrations(next, root)
    const group: FolderGroup = { rootId: root, branchWorkspaces: registrations }
    const groups = registry.workspaces.some((entry) => entry.rootId === root)
      ? registry.workspaces.map((entry) => (entry.rootId === root ? group : entry))
      : [...registry.workspaces, group]
    await backupLegacyRegistry(dataFile, registry)
    await writeJsonRegistryAtomically(
      dataFile,
      { version: 3, workspaces: groups },
      dependencies.randomId?.() ?? randomUUID(),
    )
    const runtime = executionByFile.get(dataFile) ?? new Map<string, BranchWorkspaceManifest[]>()
    runtime.set(root, cloneManifests(next))
    executionByFile.set(dataFile, runtime)
  })
}

export async function discardBranchWorkspaceRecords(
  rootId: string,
  ids: readonly string[],
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  if (!ids.length) return
  const removed = new Set(ids)
  await updateBranchWorkspaceManifests(
    rootId,
    (manifests) => manifests.filter((manifest) => !removed.has(manifest.id)),
    dependencies,
  )
}

export async function cleanupBranchWorkspaceRegistry(
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceRegistryCleanupResult> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  let result: BranchWorkspaceRegistryCleanupResult = { ok: true, outcome: 'unchanged', removedRecords: 0 }
  await enqueueFileWrite(writeQueues, dataFile, async () => {
    let raw: string
    try {
      raw = await readFile(dataFile, 'utf8')
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    try {
      normalizeRegistry(parsed)
      return
    } catch {}
    const record = asRecord(parsed)
    const groups: FolderGroup[] = [],
      seenRoots = new Set<string>()
    let removedRecords = 0
    if (
      record &&
      (record.version === 1 || record.version === 2 || record.version === 3) &&
      Array.isArray(record.workspaces)
    ) {
      for (const value of record.workspaces) {
        const group = asRecord(value)
        if (!group || typeof group.rootId !== 'string' || !Array.isArray(group.branchWorkspaces)) {
          removedRecords++
          continue
        }
        const rootId = workspaceRootId(group.rootId)
        if (seenRoots.has(rootId)) {
          removedRecords++
          continue
        }
        seenRoots.add(rootId)
        const registrations: FolderRegistration[] = [],
          seenIds = new Set<string>(),
          seenPaths = new Set<string>()
        for (const value of group.branchWorkspaces) {
          try {
            const [registration] = normalizeRegistrations([value], rootId)
            if (!registration || seenIds.has(registration.id) || seenPaths.has(registration.path))
              throw new Error(invalidRegistryMessage)
            registrations.push(registration)
            seenIds.add(registration.id)
            seenPaths.add(registration.path)
          } catch {
            removedRecords++
          }
        }
        groups.push({ rootId, branchWorkspaces: registrations })
      }
      result = { ok: true, outcome: 'repaired', removedRecords }
    } else result = { ok: true, outcome: 'reset', removedRecords: 0 }
    await writeJsonRegistryAtomically(
      dataFile,
      { version: 3, workspaces: groups },
      dependencies.randomId?.() ?? randomUUID(),
    )
    executionByFile.delete(dataFile)
  })
  return result
}

async function readRegistry(dataFile: string): Promise<RegistrySnapshot> {
  try {
    return { kind: 'ready', registry: normalizeRegistry(JSON.parse(await readFile(dataFile, 'utf8'))) }
  } catch (error) {
    return isErrno(error, 'ENOENT') ? { kind: 'missing' } : { kind: 'invalid' }
  }
}

function normalizeRegistry(value: unknown): FolderRegistry {
  const record = asRecord(value)
  if (
    !record ||
    !(record.version === 1 || record.version === 2 || record.version === 3) ||
    !Array.isArray(record.workspaces)
  )
    throw new Error(invalidRegistryMessage)
  const groups: FolderGroup[] = [],
    roots = new Set<string>()
  for (const value of record.workspaces) {
    const group = asRecord(value)
    if (!group || typeof group.rootId !== 'string' || !group.rootId || !Array.isArray(group.branchWorkspaces))
      throw new Error(invalidRegistryMessage)
    const rootId = workspaceRootId(group.rootId)
    if (rootId !== group.rootId || roots.has(rootId)) throw new Error(invalidRegistryMessage)
    roots.add(rootId)
    groups.push({ rootId, branchWorkspaces: normalizeRegistrations(group.branchWorkspaces, rootId) })
  }
  return { version: record.version as 1 | 2 | 3, workspaces: groups }
}

function normalizeRegistrations(value: unknown, rootId: string): FolderRegistration[] {
  if (!Array.isArray(value)) throw new Error(invalidRegistryMessage)
  const ids = new Set<string>(),
    paths = new Set<string>()
  return value.map((value) => {
    const record = asRecord(value)
    if (!record || typeof record.id !== 'string' || !record.id || typeof record.path !== 'string')
      throw new Error(invalidRegistryMessage)
    const folderPath = normalizeFolderPath(rootId, record.path)
    if (ids.has(record.id) || paths.has(folderPath)) throw new Error(invalidRegistryMessage)
    ids.add(record.id)
    paths.add(folderPath)
    return { id: record.id, path: folderPath }
  })
}

function normalizeFolderPath(rootId: string, value: string): string {
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  if (!value || value.includes('\0') || !pathApi.isAbsolute(value))
    throw new Error('workspace.branch-workspace.invalid-directory')
  return pathApi.normalize(value)
}

function folderManifest(rootId: string, registration: FolderRegistration): BranchWorkspaceManifest {
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  return {
    ...registration,
    rootId,
    branch: '',
    directoryName: pathApi.basename(registration.path) || registration.path,
    parentDirectory: pathApi.dirname(registration.path),
    repositories: [],
    auxiliaryEntries: [],
  }
}

function projectGroup(group: FolderGroup, runtime: BranchWorkspaceManifest[] = []): BranchWorkspaceManifest[] {
  return group.branchWorkspaces.map((registration) => {
    const transient = runtime.find((entry) => entry.id === registration.id && entry.path === registration.path)
    return transient
      ? {
          ...cloneManifests([transient])[0]!,
          ...folderManifest(group.rootId, registration),
          repositories: cloneManifests([transient])[0]!.repositories,
          auxiliaryEntries: transient.auxiliaryEntries,
          operation: transient.operation,
        }
      : folderManifest(group.rootId, registration)
  })
}
function sameFolderPath(rootId: string, left: string, right: string): boolean {
  return normalizeFolderPath(rootId, left) === normalizeFolderPath(rootId, right)
}
function cloneManifests(manifests: BranchWorkspaceManifest[]): BranchWorkspaceManifest[] {
  return structuredClone(manifests)
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
async function backupLegacyRegistry(dataFile: string, registry: FolderRegistry): Promise<void> {
  if (registry.version === 3) return
  const raw = await readFile(dataFile),
    temporaryPath = `${dataFile}.v${registry.version}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(raw)
    await handle.sync()
    await handle.close()
    try {
      await link(temporaryPath, `${dataFile}.v${registry.version}.bak`)
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error
    }
  } finally {
    await handle.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
  }
}
