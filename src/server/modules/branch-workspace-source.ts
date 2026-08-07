import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { branchWorkspacePath, workspaceRepositoryPath, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import {
  isBranchWorkspaceDirectoryName,
  type BranchWorkspaceAuxiliaryEntry,
  type BranchWorkspaceManifest,
  type BranchWorkspaceOperationSnapshot,
  type BranchWorkspaceRegistryCleanupResult,
  type BranchWorkspaceRepositoryMember,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { normalizeWorktreeCreationBase } from '#/shared/worktree-create.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

const registryFileName = 'branch-workspaces.json'
const invalidRegistryMessage = 'workspace.branch-workspace.invalid-registry'

export type BranchWorkspaceManifestSourceSnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; manifests: BranchWorkspaceManifest[] }
  | { kind: 'invalid'; message: string }

export interface BranchWorkspaceSourceDependencies {
  dataFile?: string
  randomId?: () => string
}

interface PersistedBranchWorkspaceGroup {
  rootId: string
  branchWorkspaces: BranchWorkspaceManifest[]
}

interface BranchWorkspaceRegistry {
  version: 1
  workspaces: PersistedBranchWorkspaceGroup[]
}

type BranchWorkspaceRegistrySnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; registry: BranchWorkspaceRegistry }
  | { kind: 'invalid' }

const writeQueues = new Map<string, Promise<void>>()

export async function readBranchWorkspaceManifests(
  rootId: string,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceManifestSourceSnapshot> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  await writeQueues.get(dataFile)?.catch(() => undefined)
  const snapshot = await readRegistry(dataFile)
  if (snapshot.kind === 'missing') return snapshot
  if (snapshot.kind === 'invalid') {
    return { kind: 'invalid', message: 'workspace.branch-workspace.read-failed' }
  }

  const normalizedRootId = workspaceRootId(rootId)
  const group = snapshot.registry.workspaces.find((workspace) => workspace.rootId === normalizedRootId)
  return group ? { kind: 'ready', manifests: cloneManifests(group.branchWorkspaces) } : { kind: 'missing' }
}

export async function replaceBranchWorkspaceManifests(
  rootId: string,
  manifests: BranchWorkspaceManifest[],
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  await mutateBranchWorkspaceManifests(rootId, () => manifests, dependencies)
}

export async function updateBranchWorkspaceManifests(
  rootId: string,
  mutate: (manifests: BranchWorkspaceManifest[]) => BranchWorkspaceManifest[] | Promise<BranchWorkspaceManifest[]>,
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  await mutateBranchWorkspaceManifests(rootId, mutate, dependencies)
}

export async function discardBranchWorkspaceRecords(
  rootId: string,
  branchWorkspaceIds: readonly string[],
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<void> {
  if (branchWorkspaceIds.length === 0) return
  const normalizedRootId = workspaceRootId(rootId)
  const discardedIds = new Set(branchWorkspaceIds)
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)

  await enqueueWrite(dataFile, async () => {
    const snapshot = await readRegistry(dataFile)
    if (snapshot.kind === 'missing') return
    if (snapshot.kind === 'invalid') throw new Error('workspace.branch-workspace.read-failed')
    const group = snapshot.registry.workspaces.find((workspace) => workspace.rootId === normalizedRootId)
    if (!group || !group.branchWorkspaces.some((manifest) => discardedIds.has(manifest.id))) return
    const workspaces = snapshot.registry.workspaces.map((workspace) => ({
      rootId: workspace.rootId,
      branchWorkspaces:
        workspace.rootId === normalizedRootId
          ? cloneManifests(workspace.branchWorkspaces.filter((manifest) => !discardedIds.has(manifest.id)))
          : cloneManifests(workspace.branchWorkspaces),
    }))
    await writeRegistry(dataFile, { version: 1, workspaces }, dependencies.randomId?.() ?? randomUUID())
  })
}

export async function cleanupBranchWorkspaceRegistry(
  dependencies: BranchWorkspaceSourceDependencies = {},
): Promise<BranchWorkspaceRegistryCleanupResult> {
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)
  let result: BranchWorkspaceRegistryCleanupResult = { ok: true, outcome: 'unchanged', removedRecords: 0 }

  await enqueueWrite(dataFile, async () => {
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
      await writeRegistry(dataFile, emptyRegistry(), dependencies.randomId?.() ?? randomUUID())
      result = { ok: true, outcome: 'reset', removedRecords: 0 }
      return
    }

    try {
      normalizeRegistry(parsed)
      return
    } catch {}

    const recovered = recoverRegistry(parsed)
    if (!recovered) {
      await writeRegistry(dataFile, emptyRegistry(), dependencies.randomId?.() ?? randomUUID())
      result = { ok: true, outcome: 'reset', removedRecords: 0 }
      return
    }

    await writeRegistry(dataFile, recovered.registry, dependencies.randomId?.() ?? randomUUID())
    result = { ok: true, outcome: 'repaired', removedRecords: recovered.removedRecords }
  })

  return result
}

async function mutateBranchWorkspaceManifests(
  rootId: string,
  mutate: (manifests: BranchWorkspaceManifest[]) => BranchWorkspaceManifest[] | Promise<BranchWorkspaceManifest[]>,
  dependencies: BranchWorkspaceSourceDependencies,
): Promise<void> {
  const normalizedRootId = workspaceRootId(rootId)
  const dataFile = dependencies.dataFile ?? serverDataFile(registryFileName)

  await enqueueWrite(dataFile, async () => {
    const snapshot = await readRegistry(dataFile)
    if (snapshot.kind === 'invalid') throw new Error('workspace.branch-workspace.read-failed')
    const registry: BranchWorkspaceRegistry =
      snapshot.kind === 'ready' ? snapshot.registry : { version: 1, workspaces: [] }
    const groups = registry.workspaces.map((workspace) => ({
      rootId: workspace.rootId,
      branchWorkspaces: cloneManifests(workspace.branchWorkspaces),
    }))
    const existingIndex = groups.findIndex((workspace) => workspace.rootId === normalizedRootId)
    const current = existingIndex >= 0 ? groups[existingIndex]!.branchWorkspaces : []
    const next = normalizeManifestList(await mutate(cloneManifests(current)), normalizedRootId)
    const persisted = { rootId: normalizedRootId, branchWorkspaces: next }
    if (existingIndex >= 0) groups[existingIndex] = persisted
    else groups.push(persisted)

    await writeRegistry(dataFile, { version: 1, workspaces: groups }, dependencies.randomId?.() ?? randomUUID())
  })
}

async function readRegistry(dataFile: string): Promise<BranchWorkspaceRegistrySnapshot> {
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

function normalizeRegistry(value: unknown): BranchWorkspaceRegistry {
  const registry = asRecord(value)
  if (!registry || registry.version !== 1 || !Array.isArray(registry.workspaces)) {
    throw new Error(invalidRegistryMessage)
  }

  const workspaces: PersistedBranchWorkspaceGroup[] = []
  const roots = new Set<string>()
  for (const value of registry.workspaces) {
    const workspace = asRecord(value)
    if (!workspace || typeof workspace.rootId !== 'string' || !Array.isArray(workspace.branchWorkspaces)) {
      throw new Error(invalidRegistryMessage)
    }
    const rootId = workspaceRootId(workspace.rootId)
    if (rootId !== workspace.rootId || roots.has(rootId)) throw new Error(invalidRegistryMessage)
    roots.add(rootId)
    workspaces.push({
      rootId,
      branchWorkspaces: normalizeManifestList(workspace.branchWorkspaces, rootId),
    })
  }
  return { version: 1, workspaces }
}

function recoverRegistry(value: unknown): { registry: BranchWorkspaceRegistry; removedRecords: number } | null {
  const registry = asRecord(value)
  if (!registry || registry.version !== 1 || !Array.isArray(registry.workspaces)) return null

  const workspaces: PersistedBranchWorkspaceGroup[] = []
  const roots = new Set<string>()
  let removedRecords = 0
  for (const value of registry.workspaces) {
    const workspace = asRecord(value)
    const rawRootId = exactText(workspace?.rootId)
    if (!workspace || !rawRootId || !Array.isArray(workspace.branchWorkspaces)) {
      removedRecords += 1
      continue
    }
    const rootId = workspaceRootId(rawRootId)
    if (rootId !== rawRootId || roots.has(rootId)) {
      removedRecords += 1
      continue
    }

    roots.add(rootId)
    const branchWorkspaces: BranchWorkspaceManifest[] = []
    const ids = new Set<string>()
    const branches = new Set<string>()
    const directoryNames = new Set<string>()
    for (const candidate of workspace.branchWorkspaces) {
      let manifest: BranchWorkspaceManifest
      try {
        manifest = normalizeManifest(candidate, rootId)
      } catch {
        removedRecords += 1
        continue
      }
      if (ids.has(manifest.id) || branches.has(manifest.branch) || directoryNames.has(manifest.directoryName)) {
        removedRecords += 1
        continue
      }
      ids.add(manifest.id)
      branches.add(manifest.branch)
      directoryNames.add(manifest.directoryName)
      branchWorkspaces.push(manifest)
    }
    workspaces.push({ rootId, branchWorkspaces })
  }
  return { registry: { version: 1, workspaces }, removedRecords }
}

function emptyRegistry(): BranchWorkspaceRegistry {
  return { version: 1, workspaces: [] }
}

function normalizeManifestList(value: unknown, rootId: string): BranchWorkspaceManifest[] {
  if (!Array.isArray(value)) throw new Error(invalidRegistryMessage)
  const manifests: BranchWorkspaceManifest[] = []
  const ids = new Set<string>()
  const branches = new Set<string>()
  const directoryNames = new Set<string>()
  for (const item of value) {
    const manifest = normalizeManifest(item, rootId)
    if (ids.has(manifest.id) || branches.has(manifest.branch) || directoryNames.has(manifest.directoryName)) {
      throw new Error(invalidRegistryMessage)
    }
    ids.add(manifest.id)
    branches.add(manifest.branch)
    directoryNames.add(manifest.directoryName)
    manifests.push(manifest)
  }
  return manifests
}

function normalizeManifest(value: unknown, rootId: string): BranchWorkspaceManifest {
  const manifest = asRecord(value)
  const id = exactText(manifest?.id)
  const branch = exactText(manifest?.branch)
  const directoryName = exactText(manifest?.directoryName)
  if (
    !manifest ||
    !id ||
    manifest.rootId !== rootId ||
    !branch ||
    !directoryName ||
    !isBranchWorkspaceDirectoryName(directoryName) ||
    !Array.isArray(manifest.repositories) ||
    manifest.repositories.length === 0 ||
    !Array.isArray(manifest.auxiliaryEntries)
  ) {
    throw new Error(invalidRegistryMessage)
  }

  const expectedPath = branchWorkspacePath(rootId, directoryName)
  if (manifest.path !== expectedPath) throw new Error(invalidRegistryMessage)
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) throw new Error(invalidRegistryMessage)

  const repositories: BranchWorkspaceRepositoryMember[] = []
  const names = new Set<string>()
  for (const value of manifest.repositories) {
    const member = normalizeRepositoryMember(value, branch, expectedPath, pathApi)
    if (names.has(member.repositoryName)) throw new Error(invalidRegistryMessage)
    names.add(member.repositoryName)
    repositories.push(member)
  }

  const persistedOperation = manifest.operation === undefined ? undefined : normalizeOperation(manifest.operation)
  const auxiliaryEntries: BranchWorkspaceAuxiliaryEntry[] = []
  for (const value of manifest.auxiliaryEntries) {
    const entry = normalizeAuxiliaryEntry(value, rootPath, expectedPath, pathApi)
    if (names.has(entry.name)) throw new Error(invalidRegistryMessage)
    names.add(entry.name)
    if (entry.progress !== 'complete') auxiliaryEntries.push(entry)
  }

  const repositoriesReady = repositories.every((member) => member.progress === 'complete')
  const operation =
    repositoriesReady && (persistedOperation?.kind === 'create' || persistedOperation?.kind === 'extend')
      ? undefined
      : persistedOperation
  const retainedAuxiliaryEntries =
    operation?.kind === 'remove' ||
    ((operation?.kind === 'create' || operation?.kind === 'extend') && !repositoriesReady)
      ? auxiliaryEntries
      : []

  return {
    id,
    rootId,
    branch,
    directoryName,
    path: expectedPath,
    repositories,
    auxiliaryEntries: retainedAuxiliaryEntries,
    ...(operation ? { operation } : {}),
  }
}

function normalizeRepositoryMember(
  value: unknown,
  branch: string,
  workspacePath: string,
  pathApi: Pick<typeof path, 'join'>,
): BranchWorkspaceRepositoryMember {
  const member = asRecord(value)
  const repositoryName = exactText(member?.repositoryName)
  const hasCreationBase = member ? 'creationBase' in member : false
  const creationBase = hasCreationBase
    ? normalizeWorktreeCreationBase(member?.creationBase)
    : normalizeWorktreeCreationBase({ kind: 'localBranch', branch: exactText(member?.baseBranch) })
  const syncBeforeCreate = member?.syncBeforeCreate ?? false
  const worktreePath = exactText(member?.worktreePath)
  if (
    !member ||
    !repositoryName ||
    !isWorkspaceRepositoryName(repositoryName) ||
    member.targetBranch !== branch ||
    !creationBase ||
    typeof syncBeforeCreate !== 'boolean' ||
    (member.branchOrigin !== 'created' && member.branchOrigin !== 'pre-existing') ||
    !isProgress(member.progress) ||
    worktreePath !== pathApi.join(workspacePath, repositoryName)
  ) {
    throw new Error(invalidRegistryMessage)
  }
  const lastError = optionalText(member.lastError)
  const branchCleanupProgress = optionalProgress(member.branchCleanupProgress)
  const upstreamCleanupProgress = optionalProgress(member.upstreamCleanupProgress)
  return {
    repositoryName,
    targetBranch: branch,
    creationBase,
    syncBeforeCreate,
    branchOrigin: member.branchOrigin,
    worktreePath,
    progress: member.progress,
    ...(branchCleanupProgress ? { branchCleanupProgress } : {}),
    ...(upstreamCleanupProgress ? { upstreamCleanupProgress } : {}),
    ...(lastError ? { lastError } : {}),
  }
}

function normalizeAuxiliaryEntry(
  value: unknown,
  rootPath: string,
  workspacePath: string,
  pathApi: Pick<typeof path, 'join'>,
): BranchWorkspaceAuxiliaryEntry {
  const entry = asRecord(value)
  const name = exactText(entry?.name)
  const sourcePath = exactText(entry?.sourcePath)
  const targetPath = exactText(entry?.targetPath)
  if (
    !entry ||
    !name ||
    !isWorkspaceRepositoryName(name) ||
    (entry.mode !== 'symlink' && entry.mode !== 'copy') ||
    !isProgress(entry.progress) ||
    sourcePath !== pathApi.join(rootPath, name) ||
    targetPath !== pathApi.join(workspacePath, name)
  ) {
    throw new Error(invalidRegistryMessage)
  }
  const copyBaseline = optionalText(entry.copyBaseline)
  if (entry.copyBaseline !== undefined && !copyBaseline) throw new Error(invalidRegistryMessage)
  if (entry.mode === 'symlink' && copyBaseline) throw new Error(invalidRegistryMessage)
  const lastError = optionalText(entry.lastError)
  return {
    name,
    mode: entry.mode,
    sourcePath,
    targetPath,
    ...(copyBaseline ? { copyBaseline } : {}),
    progress: entry.progress,
    ...(lastError ? { lastError } : {}),
  }
}

function normalizeOperation(value: unknown): BranchWorkspaceOperationSnapshot {
  const operation = asRecord(value)
  if (!operation || !isOperationKind(operation.kind)) throw new Error(invalidRegistryMessage)
  return { kind: operation.kind }
}

function optionalProgress(value: unknown): BranchWorkspaceRepositoryMember['progress'] | undefined {
  if (value === undefined) return undefined
  if (!isProgress(value)) throw new Error(invalidRegistryMessage)
  return value
}

async function writeRegistry(dataFile: string, registry: BranchWorkspaceRegistry, randomId: string): Promise<void> {
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

function cloneManifests(manifests: BranchWorkspaceManifest[]): BranchWorkspaceManifest[] {
  return manifests.map((manifest) => ({
    ...manifest,
    repositories: manifest.repositories.map((member) => ({
      ...member,
      creationBase: { ...member.creationBase },
    })),
    auxiliaryEntries: manifest.auxiliaryEntries.map((entry) => ({ ...entry })),
    ...(manifest.operation ? { operation: { ...manifest.operation } } : {}),
  }))
}

function isProgress(value: unknown): value is BranchWorkspaceRepositoryMember['progress'] {
  return value === 'pending' || value === 'complete' || value === 'removed' || value === 'failed'
}

function isOperationKind(value: unknown): value is BranchWorkspaceOperationSnapshot['kind'] {
  return value === 'create' || value === 'extend' || value === 'reduce' || value === 'repair' || value === 'remove'
}

function exactText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() === value && safeText(value) ? value : null
}

function optionalText(value: unknown): string | null {
  if (value === undefined) return null
  return exactText(value)
}

function safeText(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && !/[\x00-\x1f\x7f]/.test(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
