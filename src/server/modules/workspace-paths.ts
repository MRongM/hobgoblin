import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { REMOTE_PATH_EXISTS_MARKER, REMOTE_PATH_MISSING_MARKER, runRemoteCommand } from '#/system/ssh/commands.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { BRANCH_WORKSPACE_DIRECTORY_PREFIX, isSafeBranchWorkspaceFolderName } from '#/shared/branch-workspaces.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoId,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
  type RemoteRepoTarget,
} from '#/shared/remote-repo.ts'
import type { BranchWorkspaceManifest, BranchWorkspaceRepositoryMember } from '#/shared/branch-workspaces.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

const branchWorkspaceReadableLength = 48

export function workspaceRootId(rootId: string): string {
  if (!isRemoteRepoId(rootId)) return path.resolve(rootId)
  const parsed = parseRemoteRepoId(rootId)
  return parsed ? normalizeRemoteRepoId(parsed) : rootId
}

export function workspaceRepositoryId(rootId: string, member: string): string | null {
  if (!isWorkspaceRepositoryName(member)) return null
  if (!isRemoteRepoId(rootId)) return path.join(workspaceRootId(rootId), member)
  const parsed = parseRemoteRepoId(rootId)
  const root = parsed ? normalizeRemoteRepoRef(parsed) : null
  return root ? (remoteWorkspaceChildRef(root, member)?.id ?? null) : null
}

export function workspaceRepositoryPath(repoId: string): string | null {
  if (!isRemoteRepoId(repoId)) return path.resolve(repoId)
  return parseRemoteRepoId(repoId)?.remotePath ?? null
}

export function branchWorkspaceDirectoryName(branch: string, occupiedNames: ReadonlySet<string>): string {
  const normalizedBranch = branch.trim()
  if (!normalizedBranch || normalizedBranch.includes('\0') || /[\x00-\x1f\x7f]/.test(normalizedBranch)) {
    throw new Error('workspace.branch-workspace.invalid-branch')
  }
  const readable = normalizedBranch
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, branchWorkspaceReadableLength)
    .replace(/-+$/g, '')
  const base = `${BRANCH_WORKSPACE_DIRECTORY_PREFIX}${readable || 'branch'}`
  if (!occupiedNames.has(base)) return base

  const hash = createHash('sha256').update(normalizedBranch).digest('hex')
  for (let length = 8; length <= hash.length; length += 4) {
    const candidate = `${base}-${hash.slice(0, length)}`
    if (!occupiedNames.has(candidate)) return candidate
  }

  let suffix = 2
  while (occupiedNames.has(`${base}-${hash}-${suffix}`)) suffix += 1
  return `${base}-${hash}-${suffix}`
}

export function branchWorkspacePath(rootId: string, directoryName: string, parentDirectory?: string): string {
  if (!isSafeBranchWorkspaceFolderName(directoryName)) throw new Error('workspace.branch-workspace.invalid-directory')
  const pathApi = isRemoteRepoId(rootId) ? path.posix : path
  const parent = parentDirectory ?? workspaceRepositoryPath(rootId)
  if (!parent || !pathApi.isAbsolute(parent) || /[\x00-\x1f\x7f]/.test(parent))
    throw new Error('workspace.branch-workspace.invalid-directory')
  return pathApi.join(parent, directoryName)
}

/** A location-scoped host identity for owned target filesystem operations only. */
export function branchWorkspaceStorageRootId(
  workspace: Pick<BranchWorkspaceManifest, 'rootId' | 'path' | 'parentDirectory'>,
): string {
  const pathApi = isRemoteRepoId(workspace.rootId) ? path.posix : path
  return repositoryIdAtPath(workspace.rootId, workspace.parentDirectory ?? pathApi.dirname(workspace.path))
}

/** Scope an exact workspace path without changing the host or project ownership. */
export function branchWorkspaceStorageRootIdAtPath(rootId: string, workspacePath: string): string {
  return branchWorkspaceStorageRootId({ rootId, path: workspacePath })
}

interface WorkspacePathExistsDependencies {
  resolveRemoteTarget?: (repoId: string) => Promise<RemoteRepoTarget>
  runRemote?: typeof runRemoteCommand
}

export async function workspacePathExists(
  repoId: string,
  candidatePath: string,
  dependencies: WorkspacePathExistsDependencies = {},
): Promise<boolean> {
  if (!isRemoteRepoId(repoId)) {
    try {
      await access(candidatePath)
      return true
    } catch {
      return false
    }
  }

  const target = await (dependencies.resolveRemoteTarget ?? resolveWorkspaceRemoteTarget)(repoId)
  const result = await (dependencies.runRemote ?? runRemoteCommand)(target, {
    type: 'testPathExists',
    path: candidatePath,
  })
  if (!result.ok) throw new Error(result.message || result.stderr || 'error.failed-read-repo')
  if (result.stdout === REMOTE_PATH_EXISTS_MARKER) return true
  if (result.stdout === REMOTE_PATH_MISSING_MARKER) return false
  throw new Error('error.failed-read-repo')
}

async function resolveWorkspaceRemoteTarget(repoId: string): Promise<RemoteRepoTarget> {
  const parsed = parseRemoteRepoId(repoId)
  if (!parsed) throw new Error('error.ssh-config-changed')
  return (await resolveRepositoryRemoteTarget(parsed)).target
}

/** Preserve opaque host identity while replacing only the filesystem path. */
export function repositoryIdAtPath(rootId: string, repositoryPath: string): string {
  const remote = parseRemoteRepoId(rootId)
  return remote ? normalizeRemoteRepoId({ ...remote, remotePath: repositoryPath }) : path.resolve(repositoryPath)
}

export function branchWorkspaceMemberRepositoryId(
  rootId: string,
  member: Pick<BranchWorkspaceRepositoryMember, 'repositoryId' | 'repositoryName' | 'kind' | 'worktreePath' | 'source'>,
): string | null {
  if (member.kind === 'repository') return repositoryIdAtPath(rootId, member.worktreePath)
  return (
    member.repositoryId ??
    (member.source?.kind === 'repository'
      ? member.source.repositoryId
      : workspaceRepositoryId(rootId, member.repositoryName))
  )
}
