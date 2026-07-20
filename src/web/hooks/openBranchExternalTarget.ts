import { openRepositoryRemote } from '#/web/repo-client.ts'
import type { RepoBranchState } from '#/web/stores/repos/types.ts'
import type { ExecResult } from '#/web/types.ts'

export async function openBranchExternalTarget(
  repoId: string,
  branch: Pick<RepoBranchState, 'name'>,
): Promise<ExecResult> {
  return await openRepositoryRemote(repoId, branch.name)
}
