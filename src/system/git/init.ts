import { gitResult } from '#/system/git/helper.ts'
import type { ExecResult } from '#/shared/git-types.ts'

export async function initRepository(cwd: string): Promise<ExecResult> {
  return await gitResult(cwd, 'init')
}
