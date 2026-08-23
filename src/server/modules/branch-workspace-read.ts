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
  BranchWorkspaceIssue,
  BranchWorkspaceManifest,
  BranchWorkspaceReadResult,
  BranchWorkspaceRepositorySnapshot,
  BranchWorkspaceSnapshot,
} from '#/shared/branch-workspaces.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { sameLocalHostPath } from '#/shared/path-semantics.ts'
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

type RepositorySnapshotRead = { ok: true; snapshot: RepoSnapshot | null } | { ok: false; error: unknown }

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

    const manifests = manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : []
    const repositoryNames = new Set(configSnapshot.config.repo)
    const referencedRepositoryNames = Array.from(
      new Set(
        manifests.flatMap((manifest) =>
          manifest.repositories
            .map((member) => member.repositoryName)
            .filter((repositoryName) => repositoryNames.has(repositoryName)),
        ),
      ),
    )
    const repositorySnapshots = repositorySnapshotCache(
      rootId,
      referencedRepositoryNames,
      dependencies.readRepositorySnapshot ?? getRepositorySnapshot,
      signal,
    )
    const auxiliaryCandidates = await (dependencies.listCandidates ?? listBranchWorkspaceAuxiliaryCandidates)(
      rootId,
      repositoryNames,
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
): Map<string, Promise<RepositorySnapshotRead>> {
  return new Map(
    repositoryNames.map((repositoryName) => {
      const repoId = workspaceRepositoryId(rootId, repositoryName)
      const snapshot = repoId
        ? readRepositorySnapshot(repoId, signal, {
            includeWorktreeStatus: false,
            includeRemote: false,
          })
            .then((value) => {
              signal?.throwIfAborted()
              return { ok: true as const, snapshot: value }
            })
            .catch((error: unknown) => ({ ok: false as const, error }))
        : Promise.resolve({ ok: true as const, snapshot: null })
      return [repositoryName, snapshot]
    }),
  )
}

async function projectBranchWorkspace(
  manifest: BranchWorkspaceManifest,
  configuredRepositories: ReadonlySet<string>,
  repositorySnapshots: Map<string, Promise<RepositorySnapshotRead>>,
  signal: AbortSignal | undefined,
  dependencies: BranchWorkspaceReadDependencies,
): Promise<BranchWorkspaceSnapshot> {
  const issues: BranchWorkspaceIssue[] = []
  const inspect = dependencies.inspectPath ?? inspectBranchWorkspacePath
  const rootInspection = await inspect(manifest.rootId, manifest.path, signal)
  const rootReady = rootInspection.exists && rootInspection.kind === 'directory'
  if (!rootInspection.exists || rootInspection.kind === 'missing') {
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
  const auxiliaryEntries = manifest.auxiliaryEntries
    .filter((entry) => entry.progress !== 'complete')
    .map((entry) => ({ ...entry, ready: false }))
  const activeOperation = dependencies.readActiveOperation
    ? await dependencies.readActiveOperation(manifest.rootId, manifest.id)
    : null
  const state = projectState(manifest, issues)
  return {
    id: manifest.id,
    rootId: manifest.rootId,
    branch: manifest.branch,
    directoryName: manifest.directoryName,
    path: manifest.path,
    state,
    available: rootReady && !(state.kind === 'needs-action' && state.action === 'continue-delete'),
    issues,
    repositories,
    auxiliaryEntries,
    ...(activeOperation ? { activeOperation } : {}),
  }
}

async function reconcileRepositoryMember(
  manifest: BranchWorkspaceManifest,
  member: BranchWorkspaceManifest['repositories'][number],
  configuredRepositories: ReadonlySet<string>,
  snapshotPromise: Promise<RepositorySnapshotRead> | undefined,
  issues: BranchWorkspaceIssue[],
): Promise<BranchWorkspaceRepositorySnapshot> {
  if (
    member.progress === 'removed' &&
    (manifest.operation?.kind === 'remove' || manifest.operation?.kind === 'reduce')
  ) {
    return { ...member, ready: false }
  }
  if (member.progress === 'pending') {
    issues.push({ kind: 'repository-pending', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  if (member.progress === 'failed') {
    issues.push({
      kind: 'repository-failed',
      repositoryName: member.repositoryName,
      ...(member.lastError ? { message: member.lastError } : {}),
    })
    return { ...member, ready: false }
  }
  if (!configuredRepositories.has(member.repositoryName) || !snapshotPromise) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }

  const snapshotRead = await snapshotPromise
  if (!snapshotRead.ok) throw snapshotRead.error
  const { snapshot } = snapshotRead
  if (!snapshot) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  const branch = snapshot.branches.find((item) => item.name === member.targetBranch)
  if (!branch?.worktree) {
    issues.push({ kind: 'worktree-missing', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  if (!sameHostPath(manifest.rootId, branch.worktree.path, member.worktreePath)) {
    issues.push({ kind: 'worktree-path-mismatch', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  if (branch.worktree.isPrunable) {
    issues.push({ kind: 'worktree-missing', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  return { ...member, ready: true }
}

function projectState(
  manifest: BranchWorkspaceManifest,
  issues: BranchWorkspaceIssue[],
): BranchWorkspaceSnapshot['state'] {
  if (manifest.operation?.kind === 'remove') return { kind: 'needs-action', action: 'continue-delete' }
  if (manifest.operation?.kind === 'reduce') return { kind: 'needs-action', action: 'continue-reduce' }
  if (manifest.operation?.kind === 'repair') {
    return { kind: 'needs-action', action: 'repair', reason: 'drift' }
  }
  const hasCreateProgress = issues.some(
    (issue) => issue.kind === 'repository-pending' || issue.kind === 'repository-failed',
  )
  if (hasCreateProgress) {
    return { kind: 'needs-action', action: 'repair', reason: 'creation-interrupted' }
  }
  return issues.length > 0 ? { kind: 'needs-action', action: 'repair', reason: 'drift' } : { kind: 'ready' }
}

function sameHostPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : sameLocalHostPath(left, right)
}

function safeReadMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message === 'cancelled' || message.startsWith('workspace.') || message.startsWith('error.')
    ? message
    : 'workspace.branch-workspace.read-failed'
}
