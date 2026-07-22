import path from 'node:path'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'

export type BranchWorkspaceFileMutationInput = {
  rootId: string
  worktreePath: string
  paths: string[]
} & (
  | { kind: 'delete' }
  | { kind: 'rename'; newName: string }
  | { kind: 'move'; targetDirPath: string }
)

interface BranchWorkspaceProtectedPathDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
}

export async function assertBranchWorkspaceFileMutationAllowed(
  input: BranchWorkspaceFileMutationInput,
  dependencies: BranchWorkspaceProtectedPathDependencies = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const snapshot = await (dependencies.readManifests ?? readBranchWorkspaceManifests)(input.rootId).catch(() => null)
  if (!snapshot || snapshot.kind === 'invalid') {
    return { ok: false, message: 'workspace.branch-workspace.read-failed' }
  }
  if (snapshot.kind === 'missing') return { ok: true }
  const rootPath = workspaceRepositoryPath(input.rootId)
  if (!rootPath) return { ok: false, message: 'error.invalid-arguments' }
  const pathApi = isRemoteRepoId(input.rootId) ? path.posix : path
  const normalizedWorktreePath = pathApi.resolve(input.worktreePath)
  const protectedPaths = new Set<string>()
  for (const manifest of snapshot.manifests) {
    if (samePath(pathApi, normalizedWorktreePath, rootPath)) protectedPaths.add(pathApi.resolve(manifest.path))
    if (!samePath(pathApi, normalizedWorktreePath, manifest.path)) continue
    for (const repository of manifest.repositories) protectedPaths.add(pathApi.resolve(repository.worktreePath))
  }
  if (protectedPaths.size === 0) return { ok: true }

  const candidates = [...input.paths]
  if (input.kind === 'rename' && input.paths[0]) {
    candidates.push(pathApi.join(pathApi.dirname(input.paths[0]), input.newName))
  } else if (input.kind === 'move') {
    candidates.push(...input.paths.map((sourcePath) => pathApi.join(input.targetDirPath, pathApi.basename(sourcePath))))
  }
  return candidates.some((candidatePath) => protectedPaths.has(pathApi.resolve(candidatePath)))
    ? { ok: false, message: 'branch-workspace.managed-path-protected' }
    : { ok: true }
}

function samePath(pathApi: Pick<typeof path, 'resolve'>, left: string, right: string): boolean {
  return pathApi.resolve(left) === pathApi.resolve(right)
}
