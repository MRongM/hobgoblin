import path from 'node:path'
import {
  inspectBranchWorkspacePath,
  listBranchWorkspaceAuxiliaryCandidates,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import { workspaceRepositoryId } from '#/server/modules/workspace-paths.ts'
import { getRepositorySnapshot } from '#/server/modules/repo-read-paths.ts'
import type {
  BranchWorkspaceActiveOperation,
  BranchWorkspaceAuxiliarySnapshot,
  BranchWorkspaceIssue,
  BranchWorkspaceManifest,
  BranchWorkspaceReadResult,
  BranchWorkspaceRepositorySnapshot,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

interface BranchWorkspaceReadDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  readConfig?: typeof readWorkspaceConfig
  readRepositorySnapshot?: typeof getRepositorySnapshot
  inspectPath?: typeof inspectBranchWorkspacePath
  listCandidates?: typeof listBranchWorkspaceAuxiliaryCandidates
  readActiveOperation?: (
    rootId: string,
    branchWorkspaceId: string,
  ) => BranchWorkspaceActiveOperation | null | Promise<BranchWorkspaceActiveOperation | null>
}

export async function readBranchWorkspaceSnapshot(
  rootId: string,
  signal?: AbortSignal,
  dependencies: BranchWorkspaceReadDependencies = {},
): Promise<BranchWorkspaceReadResult> {
  try {
    signal?.throwIfAborted()
    const [manifestSnapshot, configSnapshot] = await Promise.all([
      (dependencies.readManifests ?? readBranchWorkspaceManifests)(rootId),
      (dependencies.readConfig ?? readWorkspaceConfig)(rootId),
    ])
    if (manifestSnapshot.kind === 'invalid') return { ok: false, message: manifestSnapshot.message }
    if (configSnapshot.kind === 'invalid') return { ok: false, message: configSnapshot.message }
    if (configSnapshot.kind === 'missing') return { ok: false, message: 'workspace.config.missing' }

    const repositoryNames = new Set(configSnapshot.config.repo)
    const auxiliaryCandidates = await (dependencies.listCandidates ?? listBranchWorkspaceAuxiliaryCandidates)(
      rootId,
      repositoryNames,
      signal,
    )
    const manifests = manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : []
    const repositorySnapshots = repositorySnapshotCache(
      rootId,
      configSnapshot.config.repo,
      dependencies.readRepositorySnapshot ?? getRepositorySnapshot,
      signal,
    )
    const items = await Promise.all(
      manifests.map(
        async (manifest) =>
          await projectBranchWorkspace(manifest, repositoryNames, repositorySnapshots, signal, dependencies),
      ),
    )
    return { ok: true, rootId, items, auxiliaryCandidates }
  } catch (error) {
    return { ok: false, message: safeReadMessage(error) }
  }
}

function repositorySnapshotCache(
  rootId: string,
  repositoryNames: string[],
  readRepositorySnapshot: typeof getRepositorySnapshot,
  signal?: AbortSignal,
): Map<string, Promise<RepoSnapshot | null>> {
  return new Map(
    repositoryNames.map((repositoryName) => {
      const repoId = workspaceRepositoryId(rootId, repositoryName)
      const snapshot = repoId
        ? readRepositorySnapshot(repoId, signal).catch(() => null)
        : Promise.resolve<RepoSnapshot | null>(null)
      return [repositoryName, snapshot]
    }),
  )
}

async function projectBranchWorkspace(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: ReadonlySet<string>,
  repositorySnapshots: Map<string, Promise<RepoSnapshot | null>>,
  signal: AbortSignal | undefined,
  dependencies: BranchWorkspaceReadDependencies,
): Promise<BranchWorkspaceSnapshot> {
  const issues: BranchWorkspaceIssue[] = []
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const rootInspection = await inspect(manifest.rootId, manifest.path, signal).catch(() => null)
  const rootReady = rootInspection?.exists === true && rootInspection.kind === 'directory'
  if (!rootInspection || !rootInspection.exists || rootInspection.kind === 'missing') {
    issues.push({ kind: 'root-missing' })
  } else if (rootInspection.kind !== 'directory') {
    issues.push({ kind: 'root-not-directory' })
  }

  const repositories = await Promise.all(
    manifest.repositories.map(
      async (member) =>
        await reconcileRepositoryMember(
          manifest,
          member,
          configuredRepositories,
          repositorySnapshots.get(member.repositoryName),
          issues,
        ),
    ),
  )
  const auxiliaryEntries = await Promise.all(
    manifest.auxiliaryEntries.map(
      async (entry) => await reconcileAuxiliaryEntry(manifest, entry, inspect, signal, issues),
    ),
  )
  const activeOperation = dependencies.readActiveOperation
    ? await dependencies.readActiveOperation(manifest.rootId, manifest.id)
    : null
  const lifecycle = projectLifecycle(manifest, issues, activeOperation)
  return {
    id: manifest.id,
    rootId: manifest.rootId,
    branch: manifest.branch,
    directoryName: manifest.directoryName,
    path: manifest.path,
    lifecycle,
    available: rootReady && lifecycle !== 'delete-incomplete',
    issues,
    repositories,
    auxiliaryEntries,
    ...(manifest.operation ? { operation: { ...manifest.operation } } : {}),
    ...(activeOperation ? { activeOperation } : {}),
  }
}

async function reconcileRepositoryMember(
  manifest: BranchWorkspaceManifest,
  member: BranchWorkspaceManifest['repositories'][number],
  configuredRepositories: ReadonlySet<string>,
  snapshotPromise: Promise<RepoSnapshot | null> | undefined,
  issues: BranchWorkspaceIssue[],
): Promise<BranchWorkspaceRepositorySnapshot> {
  if (member.progress === 'removed' && manifest.operation?.kind === 'remove') {
    return { ...member, observedState: 'missing' }
  }
  if (member.progress === 'pending') {
    issues.push({ kind: 'repository-pending', repositoryName: member.repositoryName })
    return { ...member, observedState: 'pending' }
  }
  if (member.progress === 'failed') {
    issues.push({
      kind: 'repository-failed',
      repositoryName: member.repositoryName,
      ...(member.lastError ? { message: member.lastError } : {}),
    })
    return { ...member, observedState: 'failed', ...(member.lastError ? { message: member.lastError } : {}) }
  }
  if (!configuredRepositories.has(member.repositoryName) || !snapshotPromise) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, observedState: 'unavailable' }
  }

  const snapshot = await snapshotPromise
  if (!snapshot) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, observedState: 'unavailable' }
  }
  const branch = snapshot.branches.find((item) => item.name === member.targetBranch)
  if (!branch?.worktree) {
    issues.push({ kind: 'worktree-missing', repositoryName: member.repositoryName })
    return { ...member, observedState: 'missing' }
  }
  if (!sameHostPath(manifest.rootId, branch.worktree.path, member.worktreePath)) {
    issues.push({ kind: 'worktree-path-mismatch', repositoryName: member.repositoryName })
    return { ...member, observedState: 'path-mismatch' }
  }
  return { ...member, observedState: 'ready' }
}

async function reconcileAuxiliaryEntry(
  manifest: BranchWorkspaceManifest,
  entry: BranchWorkspaceManifest['auxiliaryEntries'][number],
  inspect: typeof inspectBranchWorkspacePath,
  signal: AbortSignal | undefined,
  issues: BranchWorkspaceIssue[],
): Promise<BranchWorkspaceAuxiliarySnapshot> {
  if (entry.progress === 'removed' && manifest.operation?.kind === 'remove') {
    return { ...entry, observedState: 'missing' }
  }
  if (entry.progress === 'pending') {
    issues.push({ kind: 'auxiliary-pending', entryName: entry.name })
    return { ...entry, observedState: 'pending' }
  }
  if (entry.progress === 'failed') {
    issues.push({
      kind: 'auxiliary-failed',
      entryName: entry.name,
      ...(entry.lastError ? { message: entry.lastError } : {}),
    })
    return { ...entry, observedState: 'failed', ...(entry.lastError ? { message: entry.lastError } : {}) }
  }

  const observed = await inspect(manifest.rootId, entry.targetPath, signal).catch(() => null)
  if (!observed || !observed.exists || observed.kind === 'missing') {
    issues.push({ kind: 'auxiliary-missing', entryName: entry.name })
    return { ...entry, observedState: 'missing' }
  }
  if (entry.mode === 'symlink') {
    if (
      observed.kind !== 'symlink' ||
      !observed.resolvedPath ||
      !observed.linkTarget ||
      !sameHostPath(manifest.rootId, observed.linkTarget, entry.sourcePath)
    ) {
      issues.push({ kind: 'auxiliary-path-mismatch', entryName: entry.name })
      return {
        ...entry,
        observedState: 'path-mismatch',
        ...(observed.resolvedPath ? { resolvedSourcePath: observed.resolvedPath } : {}),
      }
    }
    return { ...entry, observedState: 'ready', resolvedSourcePath: observed.resolvedPath }
  }
  if (observed.kind === 'symlink') {
    issues.push({ kind: 'auxiliary-path-mismatch', entryName: entry.name })
    return { ...entry, observedState: 'path-mismatch' }
  }
  return { ...entry, observedState: 'ready' }
}

function projectLifecycle(
  manifest: BranchWorkspaceManifest,
  issues: BranchWorkspaceIssue[],
  activeOperation: BranchWorkspaceActiveOperation | null,
): BranchWorkspaceSnapshot['lifecycle'] {
  if (activeOperation) return 'active'
  if (manifest.operation?.kind === 'remove') return 'delete-incomplete'
  if (manifest.operation?.kind === 'repair') return 'needs-repair'
  const hasCreateProgress = issues.some(
    (issue) =>
      issue.kind === 'repository-pending' ||
      issue.kind === 'repository-failed' ||
      issue.kind === 'auxiliary-pending' ||
      issue.kind === 'auxiliary-failed',
  )
  if (manifest.operation?.kind === 'create' || manifest.operation?.kind === 'extend' || hasCreateProgress) {
    return 'create-incomplete'
  }
  return issues.length > 0 ? 'needs-repair' : 'ready'
}

function sameHostPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : path.resolve(left) === path.resolve(right)
}

function safeReadMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message === 'cancelled' || message.startsWith('workspace.') || message.startsWith('error.')
    ? message
    : 'workspace.branch-workspace.read-failed'
}
