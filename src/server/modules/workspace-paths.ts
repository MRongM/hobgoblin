import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { REMOTE_PATH_EXISTS_MARKER, REMOTE_PATH_MISSING_MARKER, runRemoteCommand } from '#/system/ssh/commands.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import { BRANCH_WORKSPACE_DIRECTORY_PREFIX, isBranchWorkspaceDirectoryName } from '#/shared/branch-workspaces.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoId,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
  type RemoteRepoTarget,
} from '#/shared/remote-repo.ts'
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

export function workspaceWorktreePath(repoId: string, branch: string): string | null {
  const repositoryPath = workspaceRepositoryPath(repoId)
  if (!repositoryPath) return null
  const suffix = branch.replaceAll('/', '-')
  const pathApi = isRemoteRepoId(repoId) ? path.posix : path
  return pathApi.join(pathApi.dirname(repositoryPath), `${pathApi.basename(repositoryPath)}-${suffix}`)
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

export function branchWorkspacePath(rootId: string, directoryName: string): string {
  if (!isBranchWorkspaceDirectoryName(directoryName)) {
    throw new Error('workspace.branch-workspace.invalid-directory')
  }
  if (!isRemoteRepoId(rootId)) return path.join(workspaceRootId(rootId), directoryName)
  const remotePath = parseRemoteRepoId(rootId)?.remotePath
  if (!remotePath) throw new Error('workspace.branch-workspace.invalid-root')
  return path.posix.join(remotePath, directoryName)
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
  return (await resolveSshRemoteTarget(parsed)).target
}
