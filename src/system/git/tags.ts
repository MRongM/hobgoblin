import { git, gitResultWithOptions } from '#/system/git/helper.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'
import type { ExecResult } from '#/shared/git-types.ts'

export async function getLocalTags(cwd: string, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) return []
  try {
    const output = await git(cwd, ['tag', '--sort=-creatordate'], { signal })
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function createLocalTag(cwd: string, name: string, ref: string, signal?: AbortSignal): Promise<ExecResult> {
  if (!isSafeBranchName(name)) return { ok: false, message: 'error.invalid-arguments' }
  return await gitResultWithOptions(cwd, { signal }, 'tag', name, ref)
}

export async function deleteLocalTag(cwd: string, name: string, signal?: AbortSignal): Promise<ExecResult> {
  if (!isSafeBranchName(name)) return { ok: false, message: 'error.invalid-arguments' }
  return await gitResultWithOptions(cwd, { signal }, 'tag', '-d', name)
}
