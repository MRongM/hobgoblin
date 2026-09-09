import path from 'node:path'
import {
  inspectBranchWorkspacePath,
  listBranchWorkspaceAuxiliaryCandidates,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { discoverBranchWorkspaceDirectories } from '#/server/modules/branch-workspace-discovery-source.ts'
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
import { sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

interface BranchWorkspaceReadDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
  readConfig?: typeof readWorkspaceConfig
  readRepositorySnapshot?: typeof getRepositorySnapshot
  discoverDirectories?: typeof discoverBranchWorkspaceDirectories
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
      readBranchWorkspaceCatalog(rootId, signal, {
        readManifests: dependencies.readManifests,
        discoverDirectories: dependencies.discoverDirectories,
      }),
      (dependencies.readConfig ?? readWorkspaceConfig)(rootId),
    ])
    const manifests = manifestSnapshot.kind === 'ready' ? manifestSnapshot.manifests : []
    const configuredRepositories = configSnapshot.kind === 'ready' ? configSnapshot.config.repo : []
    const repositoryNames = new Set([
      ...configuredRepositories,
      ...manifests.flatMap((manifest) => manifest.repositories.map((member) => member.repositoryName)),
    ])
    const referencedRepositoryIds = Array.from(
      new Set(
        manifests.flatMap((manifest) =>
          manifest.repositories
            .map((member) => member.repositoryId ?? workspaceRepositoryId(rootId, member.repositoryName))
            .filter((id): id is string => !!id),
        ),
      ),
    )
    const repositorySnapshots = repositorySnapshotCache(
      referencedRepositoryIds,
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
        async (manifest) => await projectBranchWorkspace(manifest, repositorySnapshots, signal, dependencies),
      ),
    )
    return { ok: true, rootId, items, auxiliaryCandidates }
  } catch (error) {
    return { ok: false, message: safeReadMessage(error) }
  }
}

function repositorySnapshotCache(
  repositoryIds: string[],
  readRepositorySnapshot: typeof getRepositorySnapshot,
  signal?: AbortSignal,
): Map<string, Promise<RepositorySnapshotRead>> {
  return new Map(
    repositoryIds.map((repoId) => {
      const snapshot = readRepositorySnapshot(repoId, signal, {
        includeWorktreeStatus: false,
        includeRemote: false,
      })
        .then((value) => {
          signal?.throwIfAborted()
          return { ok: true as const, snapshot: value }
        })
        .catch((error: unknown) => ({ ok: false as const, error }))
      return [repoId, snapshot]
    }),
  )
}

async function projectBranchWorkspace(
  manifest: BranchWorkspaceManifest,
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
          repositorySnapshots.get(
            member.repositoryId ?? workspaceRepositoryId(manifest.rootId, member.repositoryName) ?? '',
          ),
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
  if (!snapshotPromise) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }

  const snapshotRead = await snapshotPromise
  const snapshot = snapshotRead.ok ? snapshotRead.snapshot : null
  if (!snapshot) {
    issues.push({ kind: 'repository-unavailable', repositoryName: member.repositoryName })
    return { ...member, ready: false }
  }
  const branch = snapshot.branches.find(
    (item) => item.worktree && sameHostPath(manifest.rootId, item.worktree.path, member.worktreePath),
  )
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
  return { ...member, targetBranch: branch.name, ready: true }
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
  return issues.some((issue) => issue.kind === 'root-missing' || issue.kind === 'root-not-directory')
    ? { kind: 'needs-action', action: 'repair', reason: 'drift' }
    : { kind: 'ready' }
}

function sameHostPath(rootId: string, left: string, right: string): boolean {
  return isRemoteRepoId(rootId)
    ? path.posix.normalize(left) === path.posix.normalize(right)
    : sameLocalFilePath(left, right)
}

function safeReadMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message === 'cancelled' || message.startsWith('workspace.') || message.startsWith('error.')
    ? message
    : 'workspace.branch-workspace.read-failed'
}
