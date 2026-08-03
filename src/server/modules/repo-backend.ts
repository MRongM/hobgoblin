import path from 'node:path'
import { checkGitAvailable, type GitNetworkOptions } from '#/system/git/helper.ts'
import {
  checkoutBranch,
  createBranch as createLocalBranch,
  createTrackingBranch,
  deleteBranch,
  deleteRemoteServerBranch as deleteLocalRemoteServerBranch,
  deleteUpstreamBranch,
  getBranches,
  getCurrentBranch,
  getRepoName,
  getRepoRoot,
  getUpstream,
  isAncestor,
  isGitRepo,
} from '#/system/git/branches.ts'
import {
  getCommitDetail as getLocalCommitDetail,
  getCommitHistory as getLocalCommitHistory,
} from '#/system/git/history.ts'
import {
  fetchAll,
  fetchRemote as fetchLocalRemote,
  getBrowserRemoteUrl,
  getRemoteInfo,
  pullBranch,
  pushBranch,
} from '#/system/git/remote.ts'
import {
  createLocalTag as createLocalGitTag,
  deleteLocalTag as deleteLocalGitTag,
  getLocalTags as getLocalGitTags,
  pushLocalTag as pushLocalGitTag,
} from '#/system/git/tags.ts'
import {
  deleteRemoteServerTag as deleteLocalRemoteServerTag,
  getRemoteTags as getLocalRemoteTags,
  getRemoteTrackingBranches as getLocalRemoteTrackingBranches,
} from '#/system/git/remote-refs.ts'
import { getWorkingStatus } from '#/system/git/status.ts'
import { createWorktree, getWorktrees, pruneWorktrees, removeWorktree } from '#/system/git/worktrees.ts'
import { getWorktreePatch } from '#/system/git/patch.ts'
import { bootstrapWorktreeSelectionsAfterCreate } from '#/system/git/worktree-bootstrap.ts'
import {
  getLocalWorktreeBootstrapPreflight,
  validateLocalWorktreeBootstrapSelections,
} from '#/system/git/worktree-bootstrap-candidates.ts'
import { getWorktreeCommitMessageContext, type CommitMessageContext } from '#/system/git/commit-message-context.ts'
import { commitAllChanges } from '#/system/git/commit.ts'
import { mergeBranch } from '#/system/git/merge.ts'
import { discardChangesForPaths, resetHardToCurrentHead } from '#/system/git/reset.ts'
import { type CommitDetail, type CommitHistoryEntry, type ExecResult, type WorktreeStatus } from '#/shared/git-types.ts'
import { resolveKnownWorktree, resolvePrunableWorktree, resolveRemovableWorktree } from '#/shared/worktree-guards.ts'
import { isValidCwd, MAX_IPC_PATH_LENGTH } from '#/shared/input-validation.ts'
import { validateBranchDeletionPolicy, validateRemovableWorktreeState } from '#/shared/repo-action-policy.ts'
import { resolveRemoteTarget as resolveSshRemoteTarget } from '#/system/ssh/config.ts'
import { testRemoteRepository } from '#/system/ssh/diagnostics.ts'
import {
  checkoutRemoteBranch,
  commitRemoteChanges,
  createRemoteBranch,
  createRemoteTrackingBranch,
  createLocalTag as createRemoteLocalTag,
  createRemoteWorktree,
  bootstrapRemoteWorktreeSelectionsAfterCreate,
  deleteRemoteBranch,
  deleteLocalTag as deleteRemoteLocalTag,
  deleteRemoteServerBranch as deleteSshRemoteServerBranch,
  deleteRemoteServerTag as deleteSshRemoteServerTag,
  pushLocalTag as pushRemoteLocalTag,
  discardRemoteChangesForPaths,
  fetchRemoteRepository,
  fetchRemoteRepositoryByName,
  getRemoteBrowserUrl,
  getRemoteCommitDetail,
  getRemoteHistory,
  isRemoteAncestor,
  getRemotePatch,
  getRemoteSnapshot,
  getRemoteStatus,
  getLocalTags as getRemoteLocalTags,
  getRemoteTags as getSshRemoteTags,
  getRemoteTrackingBranches as getSshRemoteTrackingBranches,
  getRemoteWorktreeBootstrapPreflight,
  mergeRemoteBranch,
  pullRemoteBranch,
  pushRemoteBranch,
  pruneRemoteWorktrees,
  resetRemoteHard,
  removeRemoteWorktree,
  validateRemoteWorktreeBootstrapSelections,
} from '#/system/ssh/git.ts'
import {
  isRemoteRepoId,
  parseRemoteRepoId,
  type ProbeResult,
  type RemoteRepoTarget,
  type RepoSnapshot,
} from '#/shared/rpc.ts'
import type { CreateWorktreeInput } from '#/shared/worktree-create.ts'
import type {
  WorktreeBootstrapDecision,
  WorktreeBootstrapCandidateScope,
  WorktreeBootstrapPreflightResult,
} from '#/shared/worktree-bootstrap-summary.ts'

type ProbeAvailability = { ok: true } | { ok: false; message: string }

export interface RepoSnapshotOptions {
  includeWorktreeStatus?: boolean
  includeRemote?: boolean
}

export type CommitMessageContextResult =
  | { ok: true; worktreePath: string; context: CommitMessageContext }
  | { ok: false; message: string }

export interface RepoBackend {
  id: string
  kind: 'local' | 'remote'
  probe(): Promise<ProbeResult>
  getSnapshot(signal?: AbortSignal, options?: RepoSnapshotOptions): Promise<RepoSnapshot | null>
  getStatus(signal?: AbortSignal): Promise<WorktreeStatus[]>
  getHistory(
    branch: string,
    input: { limit: number; skip: number },
    signal?: AbortSignal,
  ): Promise<CommitHistoryEntry[]>
  getCommitDetail(commit: string, signal?: AbortSignal): Promise<CommitDetail | null>
  getRemoteBranches(signal?: AbortSignal): Promise<string[]>
  getRemoteTags(signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<string[]>
  getLocalTags(signal?: AbortSignal): Promise<string[]>
  fetch(signal: AbortSignal, networkOptions?: GitNetworkOptions): Promise<{ ok: boolean; message: string }>
  fetchRemote(remote: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
  checkout(branch: string, signal?: AbortSignal): Promise<ExecResult>
  checkoutWorktree(worktreePath: string, branch: string, signal?: AbortSignal): Promise<ExecResult>
  pull(
    branch: string,
    worktreePath?: string,
    signal?: AbortSignal,
    networkOptions?: GitNetworkOptions,
  ): Promise<ExecResult>
  push(branch: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
  commitAll(worktreePath: string, message: string, signal?: AbortSignal): Promise<ExecResult>
  merge(worktreePath: string, branch: string, signal?: AbortSignal): Promise<ExecResult>
  isAncestor(ancestor: string, descendant: string, signal?: AbortSignal): Promise<boolean>
  resetHard(worktreePath: string, signal?: AbortSignal): Promise<ExecResult>
  discardChanges(worktreePath: string, paths: string[], signal?: AbortSignal): Promise<ExecResult>
  createBranch(branch: string, baseBranch: string, signal?: AbortSignal): Promise<ExecResult>
  trackRemoteBranch(localBranch: string, remoteRef: string, signal?: AbortSignal): Promise<ExecResult>
  createLocalTag(name: string, ref: string, signal?: AbortSignal): Promise<ExecResult>
  deleteRemoteServerBranch(
    remote: string,
    branch: string,
    signal?: AbortSignal,
    networkOptions?: GitNetworkOptions,
  ): Promise<ExecResult>
  deleteRemoteServerTag(
    remote: string,
    tag: string,
    signal?: AbortSignal,
    networkOptions?: GitNetworkOptions,
  ): Promise<ExecResult>
  deleteLocalTag(name: string, signal?: AbortSignal): Promise<ExecResult>
  pushLocalTag(name: string, signal?: AbortSignal, networkOptions?: GitNetworkOptions): Promise<ExecResult>
  getWorktreeBootstrapPreflight(
    signal?: AbortSignal,
    candidateScope?: WorktreeBootstrapCandidateScope,
  ): Promise<WorktreeBootstrapPreflightResult>
  createWorktree(
    input: CreateWorktreeInput,
    signal?: AbortSignal,
    options?: { worktreeBootstrap?: WorktreeBootstrapDecision },
  ): Promise<ExecResult>
  deleteBranch(
    branch: string,
    options?: { force?: boolean; alsoDeleteUpstream?: boolean },
    signal?: AbortSignal,
  ): Promise<ExecResult>
  removeWorktree(
    input: {
      branch: string
      worktreePath: string
      alsoDeleteBranch: boolean
      forceRemoveWorktree?: boolean
      forceDeleteBranch?: boolean
      alsoDeleteUpstream?: boolean
    },
    signal?: AbortSignal,
  ): Promise<ExecResult>
  cleanupWorktree(worktreePath: string, signal?: AbortSignal): Promise<ExecResult>
  getCommitMessageContext?(worktreePath: string, signal?: AbortSignal): Promise<CommitMessageContextResult>
  getPatch(worktreePath: string, signal?: AbortSignal): Promise<ExecResult>
  getBrowserRemoteUrl(branch?: string, signal?: AbortSignal): Promise<string | null>
}

export async function resolveRemoteRepoTarget(repoId: string): Promise<RemoteRepoTarget> {
  const parsed = parseRemoteRepoId(repoId)
  if (!parsed) throw new Error('error.ssh-config-changed')
  return (await resolveSshRemoteTarget(parsed)).target
}

export function isValidRepositoryWorktreePath(repoId: string, worktreePath: unknown): worktreePath is string {
  if (!isRemoteRepoId(repoId)) return isValidCwd(worktreePath)
  return (
    typeof worktreePath === 'string' &&
    worktreePath.length > 0 &&
    worktreePath.length <= MAX_IPC_PATH_LENGTH &&
    !worktreePath.includes('\0') &&
    path.posix.isAbsolute(worktreePath)
  )
}

export async function runWithRepoBackend<T>(
  cwd: string,
  task: (backend: Awaited<ReturnType<typeof resolveRepoBackend>>) => Promise<T>,
): Promise<T> {
  return await task(await resolveRepoBackend(cwd))
}

export async function resolveRepoBackend(repoId: string): Promise<RepoBackend> {
  return isRemoteRepoId(repoId) ? await createRemoteRepoBackend(repoId) : createLocalRepoBackend(repoId)
}

async function probeReadableDirectory(cwd: string): Promise<ProbeAvailability> {
  try {
    const { constants: fsConstants, promises: fs } = await import('node:fs')
    const stat = await fs.stat(cwd)
    if (!stat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }
    await fs.access(cwd, fsConstants.R_OK)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: classifyPathProbeError(err) }
  }
}

function classifyPathProbeError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : ''
  if (code === 'ENOENT') return 'error.path-not-found'
  if (code === 'ENOTDIR') return 'error.path-not-directory'
  if (code === 'EACCES' || code === 'EPERM') return 'error.path-permission-denied'
  return 'error.invalid-path'
}

function isNestedPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function probeGitRepository(cwd: string): Promise<ProbeAvailability> {
  const ok = await isGitRepo(cwd)
  if (ok) return { ok: true }
  const readable = await probeReadableDirectory(cwd)
  if (!readable.ok) return readable
  return { ok: false, message: 'error.not-git-repo' }
}

function createLocalRepoBackend(repoId: string): RepoBackend {
  async function validateBranchDeletion(
    branch: string,
    options?: {
      force?: boolean
      notMergedMessage?: 'error.branch-not-fully-merged' | 'error.cannot-remove-unpushed-worktree'
    },
    signal?: AbortSignal,
    ignoredWorktreePath?: string,
  ): Promise<ExecResult | null> {
    const current = await getCurrentBranch(repoId, { signal })
    const worktrees = await getWorktrees(repoId, { includeStatus: false, signal })
    const ignoredPath = ignoredWorktreePath ? path.resolve(ignoredWorktreePath) : null
    const isCheckedOutElsewhere = worktrees.some((wt) => {
      if (wt.branch !== branch) return false
      return ignoredPath ? path.resolve(wt.path) !== ignoredPath : true
    })
    const mergedToCurrent = !options?.force && current ? await isAncestor(repoId, branch, current, signal) : false
    const upstream = !options?.force ? await getUpstream(repoId, branch, signal) : null
    const mergedToUpstream = !options?.force && upstream ? await isAncestor(repoId, branch, upstream, signal) : false
    return validateBranchDeletionPolicy({
      branch,
      currentBranch: current,
      isCheckedOutElsewhere,
      force: options?.force,
      mergedToCurrent,
      mergedToUpstream,
      notMergedMessage: options?.notMergedMessage,
    })
  }

  async function deleteBranchAfterValidation(
    branch: string,
    options?: { force?: boolean; alsoDeleteUpstream?: boolean },
    signal?: AbortSignal,
  ): Promise<ExecResult> {
    const upstream = options?.alsoDeleteUpstream ? await getUpstream(repoId, branch, signal) : null
    const deleted = await deleteBranch(repoId, branch, { force: options?.force, signal })
    if (!deleted.ok || !upstream) return deleted
    const slash = upstream.indexOf('/')
    if (slash <= 0) return deleted
    return await deleteUpstreamBranch(repoId, upstream.slice(0, slash), upstream.slice(slash + 1), signal)
  }

  return {
    id: repoId,
    kind: 'local',
    async probe() {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-path' }
      const readable = await probeReadableDirectory(repoId)
      if (!readable.ok) return readable
      const gitAvailable = await checkGitAvailable()
      if (!gitAvailable.ok) {
        return { ok: true, root: repoId, name: path.basename(repoId), isGitRepo: false }
      }
      const gitRepo = await isGitRepo(repoId)
      if (!gitRepo) {
        return { ok: true, root: repoId, name: path.basename(repoId), isGitRepo: false }
      }
      const root = await getRepoRoot(repoId)
      if (!root) return { ok: false, message: 'error.failed-read-repo' }
      if (isNestedPath(root, repoId)) {
        return { ok: true, root: repoId, name: path.basename(repoId), isGitRepo: false }
      }
      const name = await getRepoName(repoId)
      return { ok: true, root, name, isGitRepo: true }
    },
    async getSnapshot(signal, options) {
      if (!isValidCwd(repoId)) return null
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      try {
        const worktrees = await getWorktrees(repoId, {
          ...(options?.includeWorktreeStatus === false ? { includeStatus: false } : {}),
          signal,
          throwOnError: true,
        })
        if (signal?.aborted) return null
        if (worktrees.length === 0) throw new Error('error.failed-read-repo')
        const branches = await getBranches(repoId, worktrees, { signal })
        if (signal?.aborted) return null
        const current = await getCurrentBranch(repoId, { signal })
        if (signal?.aborted) return null
        const remote = options?.includeRemote === false ? undefined : await getRemoteInfo(repoId, signal)
        if (signal?.aborted) return null
        return { branches, current, ...(remote ? { remote } : {}) }
      } catch (err) {
        if (signal?.aborted) return null
        throw err
      }
    },
    async getStatus(signal) {
      if (!isValidCwd(repoId)) return []
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      const status = await getWorkingStatus(repoId, { signal })
      return signal?.aborted ? [] : status
    },
    async getHistory(branch, input, signal) {
      if (!isValidCwd(repoId)) return []
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      return await getLocalCommitHistory(repoId, branch, input, { signal })
    },
    async getCommitDetail(commit, signal) {
      if (!isValidCwd(repoId)) return null
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      return await getLocalCommitDetail(repoId, commit, { signal })
    },
    async getRemoteBranches(signal) {
      if (!isValidCwd(repoId)) return []
      return await getLocalRemoteTrackingBranches(repoId, signal)
    },
    async getRemoteTags(signal, networkOptions) {
      if (!isValidCwd(repoId)) return []
      return await getLocalRemoteTags(repoId, signal, networkOptions)
    },
    async getLocalTags(signal) {
      if (!isValidCwd(repoId)) return []
      const available = await probeGitRepository(repoId)
      if (!available.ok) throw new Error(available.message)
      return await getLocalGitTags(repoId, signal)
    },
    async fetch(signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const available = await probeGitRepository(repoId)
      if (!available.ok) return available
      return await fetchAll(repoId, signal, networkOptions)
    },
    async fetchRemote(remote, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const available = await probeGitRepository(repoId)
      if (!available.ok) return available
      return await fetchLocalRemote(repoId, remote, signal, networkOptions)
    },
    async checkout(branch, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await checkoutBranch(repoId, branch, signal)
    },
    async checkoutWorktree(worktreePath, branch, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await checkoutBranch(worktreePath, branch, signal)
    },
    async pull(branch, worktreePath, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await pullBranch(repoId, branch, worktreePath, signal, networkOptions)
    },
    async push(branch, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await pushBranch(repoId, branch, signal, networkOptions)
    },
    async commitAll(worktreePath, message, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await commitAllChanges(worktreePath, message, signal)
    },
    async merge(worktreePath, branch, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await mergeBranch(worktreePath, branch, signal)
    },
    async isAncestor(ancestor, descendant, signal) {
      return await isAncestor(repoId, ancestor, descendant, signal)
    },
    async resetHard(worktreePath, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await resetHardToCurrentHead(worktreePath, signal)
    },
    async discardChanges(worktreePath, paths, signal) {
      if (!isValidCwd(worktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      return await discardChangesForPaths(worktreePath, paths, signal)
    },
    async createBranch(branch, baseBranch, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await createLocalBranch(repoId, branch, baseBranch, signal)
    },
    async trackRemoteBranch(localBranch, remoteRef, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await createTrackingBranch(repoId, localBranch, remoteRef, signal)
    },
    async createLocalTag(name, ref, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await createLocalGitTag(repoId, name, ref, signal)
    },
    async deleteRemoteServerBranch(remote, branch, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await deleteLocalRemoteServerBranch(repoId, remote, branch, signal, networkOptions)
    },
    async deleteRemoteServerTag(remote, tag, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await deleteLocalRemoteServerTag(repoId, remote, tag, signal, networkOptions)
    },
    async deleteLocalTag(name, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await deleteLocalGitTag(repoId, name, signal)
    },
    async pushLocalTag(name, signal, networkOptions) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await pushLocalGitTag(repoId, name, signal, networkOptions)
    },
    async getWorktreeBootstrapPreflight(signal, candidateScope) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      return await getLocalWorktreeBootstrapPreflight(repoId, {
        signal,
        ...(candidateScope ? { candidateScope } : {}),
      })
    },
    async createWorktree(input, signal, options) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const decision = options?.worktreeBootstrap
      const sourceWorktreePath = decision?.kind === 'skip' ? repoId : (decision?.sourceWorktreePath ?? repoId)
      if (!isValidCwd(sourceWorktreePath)) return { ok: false, message: 'error.invalid-arguments' }
      if (decision?.kind === 'materialize') {
        const validation = await validateLocalWorktreeBootstrapSelections(sourceWorktreePath, decision.selections, {
          signal,
          ...(decision.candidateScope ? { candidateScope: decision.candidateScope } : {}),
        })
        if (!validation.ok) return validation
      }
      const created = await createWorktree(repoId, input, signal)
      if (!created.ok) return created
      if (!decision || decision.kind === 'skip') return created
      const bootstrapped = await bootstrapWorktreeSelectionsAfterCreate(
        sourceWorktreePath,
        input.worktreePath,
        decision.selections,
        { signal },
      )
      if (!bootstrapped.ok) {
        return {
          ok: false,
          message: bootstrapped.message,
          repoChanged: true,
        }
      }
      return {
        ok: true,
        message: [created.message, bootstrapped.message].filter(Boolean).join('\n'),
        ...(bootstrapped.worktreeBootstrap ? { worktreeBootstrap: bootstrapped.worktreeBootstrap } : {}),
      }
    },
    async deleteBranch(branch, options, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const validation = await validateBranchDeletion(branch, { force: options?.force }, signal)
      if (validation) return validation
      return await deleteBranchAfterValidation(branch, options, signal)
    },
    async removeWorktree(input, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const worktrees = await getWorktrees(repoId, { signal })
      const removable = resolveRemovableWorktree(worktrees, input.branch, input.worktreePath, repoId)
      if (!removable.ok) return { ok: false, message: removable.message }
      const invalid = validateRemovableWorktreeState(removable.target, {
        forceRemoveWorktree: input.forceRemoveWorktree,
      })
      if (invalid) return invalid
      if (input.alsoDeleteBranch) {
        const validation = await validateBranchDeletion(
          input.branch,
          { force: input.forceDeleteBranch, notMergedMessage: 'error.cannot-remove-unpushed-worktree' },
          signal,
          removable.target.path,
        )
        if (validation) return validation
      }
      const removed = await removeWorktree(repoId, removable.target.path, {
        force: input.forceRemoveWorktree,
        signal,
      })
      if (!removed.ok || !input.alsoDeleteBranch) return removed
      return await deleteBranchAfterValidation(
        input.branch,
        { force: input.forceDeleteBranch, alsoDeleteUpstream: input.alsoDeleteUpstream },
        signal,
      )
    },
    async cleanupWorktree(worktreePath, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const worktrees = await getWorktrees(repoId, { includeStatus: false, signal })
      const prunable = resolvePrunableWorktree(worktrees, worktreePath, repoId)
      if (!prunable.ok) return { ok: false, message: prunable.message }
      return await pruneWorktrees(repoId, { signal })
    },
    async getCommitMessageContext(worktreePath, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const worktrees = await getWorktrees(repoId, { includeStatus: false, signal })
      const known = resolveKnownWorktree(worktrees, worktreePath)
      if (!known.ok) return { ok: false, message: known.message }
      try {
        return {
          ok: true,
          worktreePath: known.path,
          context: await getWorktreeCommitMessageContext(known.path, { signal }),
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    },
    async getPatch(worktreePath, signal) {
      if (!isValidCwd(repoId)) return { ok: false, message: 'error.invalid-arguments' }
      const worktrees = await getWorktrees(repoId, { includeStatus: false, signal })
      const known = resolveKnownWorktree(worktrees, worktreePath)
      if (!known.ok) return { ok: false, message: known.message }
      try {
        return { ok: true, message: await getWorktreePatch(known.path, { signal }) }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    },
    async getBrowserRemoteUrl(branch, signal) {
      return await getBrowserRemoteUrl(repoId, { branch, signal })
    },
  }
}

async function createRemoteRepoBackend(repoId: string): Promise<RepoBackend> {
  const target = await resolveRemoteRepoTarget(repoId)
  return {
    id: repoId,
    kind: 'remote',
    async probe() {
      const result = await testRemoteRepository(target)
      if (!result.ok) return { ok: false, message: result.message || 'error.failed-read-repo' }
      const snapshot = await getRemoteSnapshot(target)
      return { ok: true, root: target.id, name: target.displayName, isGitRepo: snapshot !== null }
    },
    async getSnapshot(signal, options) {
      const remoteSnapshot = await getRemoteSnapshot(target, {
        signal,
        includeWorktreeStatus: options?.includeWorktreeStatus,
        includeRemote: options?.includeRemote,
      })
      if (signal?.aborted || !remoteSnapshot) return null
      return {
        branches: remoteSnapshot.branches,
        current: remoteSnapshot.current,
        ...(options?.includeRemote === false ? {} : { remote: remoteSnapshot.remote }),
      }
    },
    async getStatus(signal) {
      const status = await getRemoteStatus(target, { signal })
      return signal?.aborted ? [] : status
    },
    async getHistory(branch, input, signal) {
      return await getRemoteHistory(target, branch, input, { signal })
    },
    async getCommitDetail(commit, signal) {
      return await getRemoteCommitDetail(target, commit, { signal })
    },
    async getRemoteBranches(signal) {
      return await getSshRemoteTrackingBranches(target, { signal })
    },
    async getRemoteTags(signal) {
      return await getSshRemoteTags(target, { signal })
    },
    async getLocalTags(signal) {
      return await getRemoteLocalTags(target, { signal })
    },
    async fetch(signal) {
      return await fetchRemoteRepository(target, { signal })
    },
    async fetchRemote(remote, signal) {
      return await fetchRemoteRepositoryByName(target, remote, { signal })
    },
    async checkout(branch, signal) {
      return await checkoutRemoteBranch(target, branch, undefined, { signal })
    },
    async checkoutWorktree(worktreePath, branch, signal) {
      return await checkoutRemoteBranch(target, branch, worktreePath, { signal })
    },
    async pull(branch, worktreePath, signal) {
      return await pullRemoteBranch(target, branch, worktreePath, { signal })
    },
    async push(branch, signal) {
      return await pushRemoteBranch(target, branch, { signal })
    },
    async commitAll(worktreePath, message, signal) {
      return await commitRemoteChanges(target, worktreePath, message, { signal })
    },
    async merge(worktreePath, branch, signal) {
      return await mergeRemoteBranch(target, worktreePath, branch, { signal })
    },
    async isAncestor(ancestor, descendant, signal) {
      return await isRemoteAncestor(target, ancestor, descendant, { signal })
    },
    async resetHard(worktreePath, signal) {
      return await resetRemoteHard(target, worktreePath, { signal })
    },
    async discardChanges(worktreePath, paths, signal) {
      return await discardRemoteChangesForPaths(target, worktreePath, paths, { signal })
    },
    async createBranch(branch, baseBranch, signal) {
      return await createRemoteBranch(target, { branch, baseBranch, signal })
    },
    async trackRemoteBranch(localBranch, remoteRef, signal) {
      return await createRemoteTrackingBranch(target, { localBranch, remoteRef, signal })
    },
    async createLocalTag(name, ref, signal) {
      return await createRemoteLocalTag(target, { name, ref, signal })
    },
    async deleteRemoteServerBranch(remote, branch, signal) {
      return await deleteSshRemoteServerBranch(target, { remote, branch, signal })
    },
    async deleteRemoteServerTag(remote, tag, signal) {
      return await deleteSshRemoteServerTag(target, { remote, tag, signal })
    },
    async deleteLocalTag(name, signal) {
      return await deleteRemoteLocalTag(target, { name, signal })
    },
    async pushLocalTag(name, signal) {
      return await pushRemoteLocalTag(target, { name, signal })
    },
    async getWorktreeBootstrapPreflight(signal, candidateScope) {
      return await getRemoteWorktreeBootstrapPreflight(target, {
        signal,
        ...(candidateScope ? { candidateScope } : {}),
      })
    },
    async createWorktree(input, signal, options) {
      const decision = options?.worktreeBootstrap
      const sourceTarget = remoteBootstrapSourceTarget(repoId, target, decision)
      if (!sourceTarget) return { ok: false, message: 'error.invalid-arguments' }
      if (decision?.kind === 'materialize') {
        const validation = await validateRemoteWorktreeBootstrapSelections(sourceTarget, decision.selections, {
          signal,
          ...(decision.candidateScope ? { candidateScope: decision.candidateScope } : {}),
        })
        if (!validation.ok) return validation
      }
      const created = await createRemoteWorktree(target, { ...input, signal })
      if (!created.ok) return created
      if (!decision || decision.kind === 'skip') return created
      const bootstrapped = await bootstrapRemoteWorktreeSelectionsAfterCreate(
        sourceTarget,
        input.worktreePath,
        decision.selections,
        { signal },
      )
      if (!bootstrapped.ok) {
        return {
          ok: false,
          message: bootstrapped.message,
          repoChanged: true,
        }
      }
      return {
        ok: true,
        message: [created.message, bootstrapped.message].filter(Boolean).join('\n'),
        ...(bootstrapped.worktreeBootstrap ? { worktreeBootstrap: bootstrapped.worktreeBootstrap } : {}),
      }
    },
    async deleteBranch(branch, options, signal) {
      return await deleteRemoteBranch(target, { branch, force: options?.force, signal })
    },
    async removeWorktree(input, signal) {
      return await removeRemoteWorktree(target, { ...input, signal })
    },
    async cleanupWorktree(worktreePath, signal) {
      return await pruneRemoteWorktrees(target, { worktreePath, signal })
    },
    async getPatch(worktreePath, signal) {
      return await getRemotePatch(target, worktreePath, { signal })
    },
    async getBrowserRemoteUrl(branch, signal) {
      return await getRemoteBrowserUrl(target, branch, { signal })
    },
  }
}

function remoteBootstrapSourceTarget(
  repoId: string,
  target: RemoteRepoTarget,
  decision: WorktreeBootstrapDecision | undefined,
): RemoteRepoTarget | null {
  const sourceWorktreePath = decision?.kind === 'skip' ? undefined : decision?.sourceWorktreePath
  if (!sourceWorktreePath) return target
  return isValidRepositoryWorktreePath(repoId, sourceWorktreePath)
    ? { ...target, remotePath: path.posix.normalize(sourceWorktreePath) }
    : null
}
