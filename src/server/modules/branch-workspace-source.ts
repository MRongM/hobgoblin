import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { branchWorkspacePath, workspaceRepositoryPath, workspaceRootId } from '#/server/modules/workspace-paths.ts'
import type {
  BranchWorkspaceAuxiliaryEntry,
  BranchWorkspaceBootstrapProgress,
  BranchWorkspaceManifest,
  BranchWorkspaceOperationSnapshot,
  BranchWorkspaceRepositoryMember,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { isWorktreeBootstrapConfigHash } from '#/shared/repo-settings.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'
import {
  normalizeWorktreeBootstrapSelections,
  type WorktreeBootstrapDecision,
} from '#/shared/worktree-bootstrap-summary.ts'

const registryFileName = 'branch-workspaces.json'
const invalidRegistryMessage = 'workspace.branch-workspace.invalid-registry'

export type BranchWorkspaceManifestSourceSnapshot =
  | { kind: 'missing' }
  | { kind: 'ready'; manifests: BranchWorkspaceManifest[] }
  | { kind: 'invalid'; message: string }

interface BranchWorkspaceSourceDependencies {
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
    !isWorkspaceRepositoryName(directoryName) ||
    !directoryName.startsWith('goblin-') ||
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

  const auxiliaryEntries: BranchWorkspaceAuxiliaryEntry[] = []
  for (const value of manifest.auxiliaryEntries) {
    const entry = normalizeAuxiliaryEntry(value, rootPath, expectedPath, pathApi)
    if (names.has(entry.name)) throw new Error(invalidRegistryMessage)
    names.add(entry.name)
    auxiliaryEntries.push(entry)
  }

  const operation = manifest.operation === undefined ? undefined : normalizeOperation(manifest.operation)
  return {
    id,
    rootId,
    branch,
    directoryName,
    path: expectedPath,
    repositories,
    auxiliaryEntries,
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
  const baseBranch = exactText(member?.baseBranch)
  const worktreePath = exactText(member?.worktreePath)
  if (
    !member ||
    !repositoryName ||
    !isWorkspaceRepositoryName(repositoryName) ||
    member.targetBranch !== branch ||
    !baseBranch ||
    (member.branchOrigin !== 'created' && member.branchOrigin !== 'pre-existing') ||
    !isProgress(member.progress) ||
    worktreePath !== pathApi.join(workspacePath, repositoryName)
  ) {
    throw new Error(invalidRegistryMessage)
  }
  const lastError = optionalText(member.lastError)
  const worktreeBootstrap = normalizePersistedWorktreeBootstrap(member.worktreeBootstrap)
  const bootstrapProgress = optionalBootstrapProgress(member.bootstrapProgress)
  const bootstrapLastError = optionalText(member.bootstrapLastError)
  if (worktreeBootstrap && !bootstrapProgress) throw new Error(invalidRegistryMessage)
  if (!worktreeBootstrap && (bootstrapProgress || bootstrapLastError)) throw new Error(invalidRegistryMessage)
  const branchCleanupProgress = optionalProgress(member.branchCleanupProgress)
  const upstreamCleanupProgress = optionalProgress(member.upstreamCleanupProgress)
  return {
    repositoryName,
    targetBranch: branch,
    baseBranch,
    branchOrigin: member.branchOrigin,
    worktreePath,
    progress: member.progress,
    ...(worktreeBootstrap ? { worktreeBootstrap } : {}),
    ...(bootstrapProgress ? { bootstrapProgress } : {}),
    ...(bootstrapLastError ? { bootstrapLastError } : {}),
    ...(branchCleanupProgress ? { branchCleanupProgress } : {}),
    ...(upstreamCleanupProgress ? { upstreamCleanupProgress } : {}),
    ...(lastError ? { lastError } : {}),
  }
}

function normalizePersistedWorktreeBootstrap(
  value: unknown,
): Exclude<WorktreeBootstrapDecision, { kind: 'skip' }> | undefined {
  if (value === undefined) return undefined
  const decision = asRecord(value)
  if (!decision) throw new Error(invalidRegistryMessage)
  if (
    decision.kind === 'run' &&
    isWorktreeBootstrapConfigHash(decision.configHash) &&
    typeof decision.configTrusted === 'boolean'
  ) {
    return { kind: 'run', configHash: decision.configHash, configTrusted: decision.configTrusted }
  }
  if (decision.kind === 'materialize' && decision.candidateScope === 'ignored-only') {
    const selections = normalizeWorktreeBootstrapSelections(decision.selections)
    if (selections) return { kind: 'materialize', candidateScope: 'ignored-only', selections }
  }
  throw new Error(invalidRegistryMessage)
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
  const startedAt = exactText(operation?.startedAt)
  if (!operation || !isOperationKind(operation.kind) || !isOperationPhase(operation.phase) || !startedAt) {
    throw new Error(invalidRegistryMessage)
  }
  return { kind: operation.kind, phase: operation.phase, startedAt }
}

function optionalProgress(value: unknown): BranchWorkspaceRepositoryMember['progress'] | undefined {
  if (value === undefined) return undefined
  if (!isProgress(value)) throw new Error(invalidRegistryMessage)
  return value
}

function optionalBootstrapProgress(value: unknown): BranchWorkspaceBootstrapProgress | undefined {
  if (value === undefined) return undefined
  if (value !== 'pending' && value !== 'complete' && value !== 'failed') {
    throw new Error(invalidRegistryMessage)
  }
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
      ...(member.worktreeBootstrap?.kind === 'materialize'
        ? {
            worktreeBootstrap: {
              ...member.worktreeBootstrap,
              selections: member.worktreeBootstrap.selections.map((selection) => ({ ...selection })),
            },
          }
        : {}),
    })),
    auxiliaryEntries: manifest.auxiliaryEntries.map((entry) => ({ ...entry })),
    ...(manifest.operation ? { operation: { ...manifest.operation } } : {}),
  }))
}

function isProgress(value: unknown): value is BranchWorkspaceRepositoryMember['progress'] {
  return value === 'pending' || value === 'complete' || value === 'removed' || value === 'failed'
}

function isOperationKind(value: unknown): value is BranchWorkspaceOperationSnapshot['kind'] {
  return value === 'create' || value === 'extend' || value === 'repair' || value === 'remove'
}

function isOperationPhase(value: unknown): value is BranchWorkspaceOperationSnapshot['phase'] {
  return value === 'pending' || value === 'running' || value === 'cancelled' || value === 'failed'
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
