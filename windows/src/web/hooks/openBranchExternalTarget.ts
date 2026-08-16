import { openRepositoryRemote } from '#/web/repo-client.ts'
import type { ExecResult } from '#/web/types.ts'

export async function openBranchExternalTarget(repoId: string): Promise<ExecResult> {
  return await openRepositoryRemote(repoId)
}
