import path from 'node:path'
import { readBranchWorkspaceManifests } from '#/server/modules/branch-workspace-source.ts'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { workspaceRepositoryPath } from '#/server/modules/workspace-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import { isBranchWorkspaceDirectoryName } from '#/shared/branch-workspaces.ts'

export type BranchWorkspaceFileMutationInput = {
  rootId: string
  worktreePath: string
  paths: string[]
} & ({ kind: 'delete' } | { kind: 'rename'; newName: string } | { kind: 'move'; targetDirPath: string })

interface BranchWorkspaceProtectedPathDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
}

export async function assertBranchWorkspaceFileMutationAllowed(
  input: BranchWorkspaceFileMutationInput,
  dependencies: BranchWorkspaceProtectedPathDependencies = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const rootPath = workspaceRepositoryPath(input.rootId)
  if (!rootPath) return { ok: false, message: 'error.invalid-arguments' }
  const pathApi = isRemoteRepoId(input.rootId) ? path.posix : path
  if (!samePath(pathApi, input.worktreePath, rootPath)) return { ok: true }

  const candidates = [...input.paths]
  if (input.kind === 'rename' && input.paths[0]) {
    candidates.push(pathApi.join(pathApi.dirname(input.paths[0]), input.newName))
  } else if (input.kind === 'move') {
    candidates.push(...input.paths.map((sourcePath) => pathApi.join(input.targetDirPath, pathApi.basename(sourcePath))))
  }
  // Only whole workspace roots are managed; members use ordinary file-tree rules.
  if (
    !candidates.some((candidate) => {
      const normalized = pathApi.resolve(candidate)
      return (
        samePath(pathApi, pathApi.dirname(normalized), rootPath) &&
        isBranchWorkspaceDirectoryName(pathApi.basename(normalized))
      )
    })
  )
    return { ok: true }

  const snapshot = await (dependencies.readManifests ?? ((rootId: string) => readBranchWorkspaceCatalog(rootId)))(
    input.rootId,
  ).catch(() => null)
  if (!snapshot || snapshot.kind === 'invalid') {
    return { ok: false, message: 'workspace.branch-workspace.read-failed' }
  }
  if (snapshot.kind === 'missing') return { ok: true }
  const protectedPaths = new Set(snapshot.manifests.map((manifest) => pathApi.resolve(manifest.path)))
  return candidates.some((candidatePath) => protectedPaths.has(pathApi.resolve(candidatePath)))
    ? { ok: false, message: 'branch-workspace.managed-path-protected' }
    : { ok: true }
}

function samePath(pathApi: Pick<typeof path, 'resolve'>, left: string, right: string): boolean {
  return pathApi.resolve(left) === pathApi.resolve(right)
}
