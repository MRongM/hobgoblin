import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from '#/system/git/helper.ts'
import type { WorktreeContentState } from '#/shared/git-types.ts'

const FULL_GIT_OID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

/**
 * Snapshot every non-ignored bit that a full remote alignment can discard.
 * The index hash preserves staged/conflict entries; the temporary index tree
 * captures tracked working-copy content plus untracked files without changing
 * the real index or worktree.
 */
export async function getWorktreeContentState(
  cwd: string,
  signal?: AbortSignal,
): Promise<WorktreeContentState | null> {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hobgoblin-align-'))
  const temporaryIndex = path.join(temporaryDirectory, 'index')
  try {
    const gitDirectory = await git(cwd, ['rev-parse', '--absolute-git-dir'], { signal })
    try {
      await fs.copyFile(path.join(gitDirectory, 'index'), temporaryIndex)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await git(cwd, ['read-tree', '--empty'], { signal, env: { GIT_INDEX_FILE: temporaryIndex } })
    }

    const indexEntries = await git(cwd, ['ls-files', '--stage', '-z'], {
      signal,
      env: { GIT_INDEX_FILE: temporaryIndex },
    })
    const indexHash = await git(cwd, ['hash-object', '--stdin'], { signal, stdin: indexEntries })
    await git(cwd, ['add', '-A', '--', '.'], { signal, env: { GIT_INDEX_FILE: temporaryIndex } })
    const worktreeTree = await git(cwd, ['write-tree'], {
      signal,
      env: { GIT_INDEX_FILE: temporaryIndex },
    })
    if (signal?.aborted || !FULL_GIT_OID_RE.test(indexHash) || !FULL_GIT_OID_RE.test(worktreeTree)) return null
    return { indexHash: indexHash.toLowerCase(), worktreeTree: worktreeTree.toLowerCase() }
  } catch {
    return null
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function worktreeContentStatesEqual(
  left: WorktreeContentState,
  right: WorktreeContentState,
): boolean {
  return left.indexHash === right.indexHash && left.worktreeTree === right.worktreeTree
}
