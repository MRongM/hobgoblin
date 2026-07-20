import { access } from 'node:fs/promises'
import path from 'node:path'
import { REMOTE_PATH_EXISTS_MARKER, REMOTE_PATH_MISSING_MARKER, runRemoteCommand } from '#/system/ssh/commands.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import {
  isRemoteRepoId,
  normalizeRemoteRepoId,
  normalizeRemoteRepoRef,
  parseRemoteRepoId,
  remoteWorkspaceChildRef,
  type RemoteRepoTarget,
} from '#/shared/remote-repo.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'

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
