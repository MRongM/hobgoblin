import { git } from '#/system/git/helper.ts'
import { FIELD_SEP, parseCommitFileChanges, parseCommitHistory } from '#/system/git/parsers.ts'
import { GIT_HASH_RE, type CommitDetail, type CommitHistoryEntry } from '#/shared/git-types.ts'
import { isSafeBranchName } from '#/shared/refnames.ts'

export interface CommitHistoryPageInput {
  limit: number
  skip: number
}

export function normalizeCommitHistoryPage(input: CommitHistoryPageInput): CommitHistoryPageInput {
  return {
    limit: Math.max(1, Math.min(200, Math.floor(input.limit))),
    skip: Math.max(0, Math.floor(input.skip)),
  }
}

function commitFormat(): string {
  return ['%H', '%h', '%s', '%an', '%aI', '%P'].join(FIELD_SEP)
}

export async function getCommitHistory(
  cwd: string,
  branch: string,
  input: CommitHistoryPageInput,
  options?: { signal?: AbortSignal },
): Promise<CommitHistoryEntry[]> {
  if (!isSafeBranchName(branch)) return []
  const page = normalizeCommitHistoryPage(input)
  try {
    const output = await git(
      cwd,
      ['log', `--format=${commitFormat()}`, `--max-count=${page.limit}`, `--skip=${page.skip}`, branch, '--'],
      { signal: options?.signal },
    )
    return options?.signal?.aborted ? [] : parseCommitHistory(output)
  } catch {
    return []
  }
}

export async function getCommitDetail(
  cwd: string,
  commit: string,
  options?: { signal?: AbortSignal },
): Promise<CommitDetail | null> {
  if (!GIT_HASH_RE.test(commit)) return null
  try {
    const [metadata, nameStatus, numstat] = await Promise.all([
      git(cwd, ['show', '-s', `--format=${commitFormat()}`, commit], { signal: options?.signal }),
      git(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-C', '--root', '-z', commit], {
        signal: options?.signal,
      }),
      git(cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '-M', '-C', '--root', '-z', commit], {
        signal: options?.signal,
      }),
    ])
    if (options?.signal?.aborted) return null
    const [entry] = parseCommitHistory(metadata)
    if (!entry) return null
    return { ...entry, files: parseCommitFileChanges(nameStatus, numstat) }
  } catch {
    return null
  }
}
