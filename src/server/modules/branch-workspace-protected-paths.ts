import {
  readAllBranchWorkspaceManifests,
  readBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'

export type BranchWorkspaceFileMutationInput = {
  rootId: string
  worktreePath: string
  paths: string[]
} & ({ kind: 'delete' } | { kind: 'rename'; newName: string } | { kind: 'move'; targetDirPath: string })

interface BranchWorkspaceProtectedPathDependencies {
  readManifests?: typeof readBranchWorkspaceManifests
}

/** Registering a folder records a location; it does not lock ordinary filesystem changes. */
export async function assertBranchWorkspaceFileMutationAllowed(
  _input: BranchWorkspaceFileMutationInput,
  _dependencies: BranchWorkspaceProtectedPathDependencies = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  return { ok: true }
}
