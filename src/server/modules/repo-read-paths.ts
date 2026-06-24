import { runWithRepoBackend } from '#/server/modules/repo-backend.ts'
import {
  getRepositoryFileTree as getRepositoryFileTreeRead,
  searchRepositoryFileTree as searchRepositoryFileTreeRead,
} from '#/server/modules/repo-file-tree.ts'
import {
  generateCodexCommitMessageFromContext,
  generateCommitMessageFromPatch,
  probeCommitMessageProviders,
} from '#/system/commit-message-ai.ts'
import { isCommitMessageProvider, type CommitMessageGenerationResult, type CommitMessageProviderAvailability } from '#/shared/commit-message-ai.ts'
import type { RepoFileSearchResult, RepoFileTreeResult } from '#/shared/file-tree.ts'
import { type CommitDetail, type CommitHistoryEntry, type ExecResult, type PullRequestFetchMode, type WorktreeStatus } from '#/shared/git-types.ts'
import type { ProbeResult, PullRequestEntry, RepoSnapshot } from '#/shared/rpc.ts'

export async function probeRepository(cwd: string): Promise<ProbeResult> {
  return await runWithRepoBackend(cwd, async (backend) => await backend.probe())
}

export async function getRepositorySnapshot(cwd: string, signal?: AbortSignal): Promise<RepoSnapshot | null> {
  return signal?.aborted ? null : await runWithRepoBackend(cwd, async (backend) => await backend.getSnapshot(signal))
}

export async function getRepositoryStatus(cwd: string, signal?: AbortSignal): Promise<WorktreeStatus[]> {
  return signal?.aborted ? [] : await runWithRepoBackend(cwd, async (backend) => await backend.getStatus(signal))
}

export async function getRepositoryPullRequests(
  cwd: string,
  branches?: string[],
  options?: { mode?: PullRequestFetchMode; signal?: AbortSignal },
): Promise<PullRequestEntry[] | null> {
  if (branches !== undefined && !Array.isArray(branches)) return null
  const mode: PullRequestFetchMode = options?.mode === 'summary' ? 'summary' : 'full'
  const branchSet =
    branches === undefined
      ? undefined
      : new Set(
          branches.filter((branch): branch is string => {
            return typeof branch === 'string' && branch.length > 0
          }),
        )
  if (branchSet?.size === 0) return []
  const branchNames = branchSet ? Array.from(branchSet) : undefined
  const prs = await runWithRepoBackend(cwd, async (backend) => await backend.getPullRequests(branchNames, { mode, signal: options?.signal }))
  if (!prs) return null
  return prs
}

export async function getRepositoryHistory(
  cwd: string,
  branch: string,
  input: { limit: number; skip: number },
  signal?: AbortSignal,
): Promise<CommitHistoryEntry[]> {
  return signal?.aborted ? [] : await runWithRepoBackend(cwd, async (backend) => await backend.getHistory(branch, input, signal))
}

export async function getRepositoryCommitDetail(
  cwd: string,
  commit: string,
  signal?: AbortSignal,
): Promise<CommitDetail | null> {
  return signal?.aborted ? null : await runWithRepoBackend(cwd, async (backend) => await backend.getCommitDetail(commit, signal))
}

export async function getRepositoryPatch(cwd: string, worktreePath: string, signal?: AbortSignal): Promise<ExecResult> {
  return await runWithRepoBackend(cwd, async (backend) => await backend.getPatch(worktreePath, signal))
}

export async function getCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  return await probeCommitMessageProviders(signal)
}

export async function generateRepositoryCommitMessage(
  cwd: string,
  worktreePath: string,
  provider: unknown,
  signal?: AbortSignal,
): Promise<CommitMessageGenerationResult> {
  if (!isCommitMessageProvider(provider)) return { ok: false, message: 'error.commit-message-provider-unavailable' }
  return await runWithRepoBackend(cwd, async (backend) => {
    if (provider === 'codex' && backend.kind === 'local' && backend.getCommitMessageContext) {
      const context = await backend.getCommitMessageContext(worktreePath, signal)
      if (!context.ok) return { ok: false, message: context.message }
      return await generateCodexCommitMessageFromContext(context.context, {
        cwd: context.worktreePath,
        signal,
      })
    }

    const patch = await backend.getPatch(worktreePath, signal)
    if (!patch.ok) return patch
    const generationCwd = backend.kind === 'local' ? worktreePath : undefined
    return await generateCommitMessageFromPatch(provider, patch.message, { cwd: generationCwd, signal })
  })
}

export async function getRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  dirPath: string,
  signal?: AbortSignal,
): Promise<RepoFileTreeResult> {
  return signal?.aborted
    ? { ok: false, message: 'cancelled' }
    : await getRepositoryFileTreeRead(repoId, worktreePath, dirPath, signal)
}

export async function searchRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  query: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<RepoFileSearchResult> {
  return signal?.aborted
    ? { ok: false, message: 'cancelled' }
    : await searchRepositoryFileTreeRead(repoId, worktreePath, query, limit, signal)
}
