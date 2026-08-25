import { openExternalUrl } from '#/web/app-shell-client.ts'
import { postServerJson } from '#/web/lib/server-fetch.ts'
import type {
  CommitMessageGenerationResult,
  CommitMessageProvider,
  CommitMessageProviderAvailability,
} from '#/shared/commit-message-ai.ts'
import type {
  RepoFileTransferRequest,
  RepoFileTransferResult,
  RepoFileTreeBinaryFileReadResult,
  RepoFileTreeBinaryFileReplaceResult,
  RepoFileTreeResult,
} from '#/shared/file-tree.ts'
import type { RepoFileExportRequest, RepoFileExportResult } from '#/shared/file-tree-export.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import type { CloneRepoResult, RepoSnapshot } from '#/shared/rpc.ts'
import type { CommitDetail, CommitHistoryEntry, ExecResult, WorktreeStatus } from '#/shared/git-types.ts'
import type { ProbeResult } from '#/shared/rpc.ts'
import type { CreateWorktreeInput } from '#/shared/worktree-create.ts'
import type {
  RepositoryBranchMergeOutExecuteInput,
  RepositoryBranchMergeOutPlanRequest,
  RepositoryBranchMergeOutPlanResult,
  RepositoryBranchMergeOutResult,
} from '#/shared/repository-branch-merge.ts'
import type { WorktreeBootstrapDecision } from '#/shared/worktree-bootstrap-summary.ts'
import type { RepositoryMergeBranchSelection } from '#/shared/repository-merge-branch.ts'
import type { WorktreeBranchSwitchTarget } from '#/shared/worktree-branch-switch.ts'
import type { RepositoryRemoteAlignmentPreviewResult } from '#/shared/repository-remote-alignment.ts'

export async function probeRepository(cwd: string): Promise<ProbeResult> {
  return await postServerJson('/api/repo/probe', { cwd })
}

export async function cloneRepository(input: {
  operationId: string
  url: string
  parentPath: string
  directoryName: string
}): Promise<CloneRepoResult> {
  return await postServerJson('/api/repo/clone', input)
}

export async function initRepository(cwd: string): Promise<ExecResult> {
  return await postServerJson('/api/repo/init', { cwd })
}

export async function abortCloneOperation(operationId: string): Promise<boolean> {
  return await postServerJson('/api/repo/abort-clone', { operationId })
}

export async function getRepositorySnapshot(cwd: string, signal?: AbortSignal): Promise<RepoSnapshot | null> {
  return await postServerJson('/api/repo/snapshot', { cwd }, { signal })
}

export async function getRepositoryStatus(cwd: string, signal?: AbortSignal): Promise<WorktreeStatus[]> {
  return await postServerJson('/api/repo/status', { cwd }, { signal })
}

export async function getRepositoryHistory(
  repoId: string,
  branch: string,
  input: { limit: number; skip: number },
  signal?: AbortSignal,
): Promise<CommitHistoryEntry[]> {
  return await postServerJson('/api/repo/history', { repoId, branch, limit: input.limit, skip: input.skip }, { signal })
}

export async function getRepositoryCommitDetail(
  repoId: string,
  commit: string,
  signal?: AbortSignal,
): Promise<CommitDetail | null> {
  return await postServerJson('/api/repo/commit-detail', { repoId, commit }, { signal })
}

export async function abortRepositoryOperation(cwd: string): Promise<boolean> {
  return await postServerJson('/api/repo/abort', { cwd })
}

export async function fetchRepository(
  cwd: string,
  kind?: 'user' | 'background',
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<{ ok: boolean; message: string }> {
  return await postServerJson('/api/repo/fetch', kind ? { cwd, kind, sourceToken } : { cwd, sourceToken }, { signal })
}

export async function checkoutRepositoryBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/checkout', { cwd, branch, sourceToken }, { signal })
}

export async function pullRepositoryBranch(
  cwd: string,
  branch: string,
  worktreePath?: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/pull', { cwd, branch, worktreePath, sourceToken }, { signal })
}

export async function pushRepositoryBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/push', { cwd, branch, sourceToken }, { signal })
}

export async function createRepositoryWorktree(
  cwd: string,
  input: CreateWorktreeInput,
  worktreeBootstrap: WorktreeBootstrapDecision,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson(
    '/api/repo/create-worktree',
    { cwd, ...input, worktreeBootstrap, sourceToken },
    { signal },
  )
}

export async function createRepositoryBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/create-branch', { cwd, branch, baseBranch, sourceToken }, { signal })
}

export async function trackRepositoryRemoteBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/track-remote-branch', { cwd, localBranch, remoteRef, sourceToken }, { signal })
}

export async function setRepositoryBranchUpstream(
  cwd: string,
  branch: string,
  remoteRef: string | null,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/set-branch-upstream', { cwd, branch, remoteRef, sourceToken }, { signal })
}

export async function deleteRepositoryBranch(
  cwd: string,
  branch: string,
  options?: { force?: boolean; alsoDeleteUpstream?: boolean },
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson(
    '/api/repo/delete-branch',
    { cwd, branch, force: options?.force, alsoDeleteUpstream: options?.alsoDeleteUpstream, sourceToken },
    { signal },
  )
}

export async function deleteRepositoryRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/delete-remote-branch', { cwd, remote, branch, sourceToken }, { signal })
}

export async function deleteRepositoryRemoteTag(
  cwd: string,
  remote: string,
  tag: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/delete-remote-tag', { cwd, remote, tag, sourceToken }, { signal })
}

export async function getRepositoryLocalTags(cwd: string, signal?: AbortSignal): Promise<string[]> {
  return await postServerJson('/api/repo/local-tags', { cwd }, { signal })
}

export async function createRepositoryLocalTag(
  cwd: string,
  name: string,
  ref: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/create-local-tag', { cwd, name, ref, sourceToken }, { signal })
}

export async function deleteRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/delete-local-tag', { cwd, name, sourceToken }, { signal })
}

export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/push-local-tag', { cwd, name, sourceToken }, { signal })
}

export async function removeRepositoryWorktree(
  cwd: string,
  options: {
    branch: string
    worktreePath: string
    alsoDeleteBranch: boolean
    forceRemoveWorktree?: boolean
    forceDeleteBranch?: boolean
    alsoDeleteUpstream?: boolean
  },
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/remove-worktree', { cwd, ...options, sourceToken }, { signal })
}

export async function cleanupRepositoryWorktree(
  cwd: string,
  worktreePath: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/cleanup-worktree', { cwd, worktreePath, sourceToken }, { signal })
}

export async function getRepositoryPatch(cwd: string, worktreePath: string, signal?: AbortSignal): Promise<ExecResult> {
  return await postServerJson('/api/repo/patch', { cwd, worktreePath }, { signal })
}

export async function getCommitMessageProviders(signal?: AbortSignal): Promise<CommitMessageProviderAvailability> {
  return await postServerJson('/api/repo/commit-message-providers', {}, { signal })
}

export async function generateRepositoryCommitMessage(
  repoId: string,
  worktreePath: string,
  provider: CommitMessageProvider,
  signal?: AbortSignal,
): Promise<CommitMessageGenerationResult> {
  return await postServerJson('/api/repo/generate-commit-message', { repoId, worktreePath, provider }, { signal })
}

export async function getRepositoryFileTree(
  repoId: string,
  worktreePath: string,
  dirPath: string,
  signal?: AbortSignal,
): Promise<RepoFileTreeResult> {
  return await postServerJson('/api/repo/file-tree', { repoId, worktreePath, dirPath }, { signal })
}

export async function renameRepositoryFileTreeEntry(
  repoId: string,
  worktreePath: string,
  oldPath: string,
  newName: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/rename', { repoId, worktreePath, oldPath, newName })
}

export async function createRepositoryFileTreeDirectory(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/create-directory', { repoId, worktreePath, parentDirPath, name })
}

export async function createRepositoryFileTreeFile(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/create-file', { repoId, worktreePath, parentDirPath, name })
}

export async function readRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReadResult> {
  return await postServerJson('/api/repo/file-tree/read-binary-file', { repoId, worktreePath, filePath, maxBytes })
}

export async function replaceRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  return await postServerJson('/api/repo/file-tree/replace-binary-file', {
    repoId,
    worktreePath,
    filePath,
    bytesBase64,
    maxBytes,
  })
}

export async function deleteRepositoryFileTreeEntries(
  repoId: string,
  worktreePath: string,
  paths: string[],
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/delete', { repoId, worktreePath, paths })
}

export async function moveRepositoryFileTreeEntries(
  repoId: string,
  worktreePath: string,
  paths: string[],
  targetDirPath: string,
): Promise<ExecResult> {
  return await postServerJson('/api/repo/file-tree/move', { repoId, worktreePath, paths, targetDirPath })
}

export async function transferRepositoryFiles(input: RepoFileTransferRequest): Promise<RepoFileTransferResult> {
  return await postServerJson('/api/repo/file-transfer', input)
}

export async function exportRepositoryFilesToLocalDirectory(
  input: RepoFileExportRequest,
): Promise<RepoFileExportResult> {
  return await postServerJson('/api/repo/file-export', input)
}

export async function openRepositoryRemote(cwd: string, branch?: string): Promise<ExecResult> {
  const result = await postServerJson<{ cwd: string; branch?: string }, ExecResult>(
    '/api/repo/open-remote',
    branch ? { cwd, branch } : { cwd },
  )
  if (!result.ok || !result.message) return result
  const opened = await openExternalUrl(result.message)
  return opened.ok ? { ok: true, message: '' } : opened
}

export async function openRepositoryTerminal(input: {
  projectRoot: string
  workingDirectory: string
}): Promise<ExecResult> {
  return await postServerJson('/api/repo/open-terminal', input)
}

export async function openRepositoryEditor(target: EditorOpenTarget): Promise<ExecResult> {
  return await postServerJson('/api/repo/open-editor', typeof target === 'string' ? { path: target } : { target })
}

export async function setBackgroundSyncRepos(repoIds: string[]): Promise<void> {
  await postServerJson('/api/repo/background-sync-repos', { repoIds })
}

export async function getRepositoryRemoteBranches(cwd: string, signal?: AbortSignal): Promise<string[]> {
  return await postServerJson('/api/repo/remote-branches', { cwd }, { signal })
}

export async function getRepositoryRemoteTags(cwd: string, signal?: AbortSignal): Promise<string[]> {
  return await postServerJson('/api/repo/remote-tags', { cwd }, { signal })
}

export async function checkoutBranchInWorktree(
  repoId: string,
  worktreePath: string,
  target: WorktreeBranchSwitchTarget,
): Promise<ExecResult> {
  return postServerJson('/api/repo/checkout-in-worktree', { repoId, worktreePath, target })
}

export async function commitRepositoryChanges(
  repoId: string,
  worktreePath: string,
  message: string,
): Promise<ExecResult> {
  return postServerJson('/api/repo/commit', { repoId, worktreePath, message })
}

export async function mergeRepositoryBranch(
  repoId: string,
  worktreePath: string,
  source: RepositoryMergeBranchSelection,
): Promise<ExecResult> {
  return postServerJson('/api/repo/merge', { repoId, worktreePath, source })
}

export async function getRepositoryBranchMergeOutPlan(
  request: RepositoryBranchMergeOutPlanRequest,
  signal?: AbortSignal,
): Promise<RepositoryBranchMergeOutPlanResult> {
  return await postServerJson('/api/repo/merge-out-plan', request, { signal })
}

export async function mergeRepositoryBranchOut(
  input: RepositoryBranchMergeOutExecuteInput,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepositoryBranchMergeOutResult> {
  return await postServerJson('/api/repo/merge-out', { ...input, sourceToken }, { signal })
}

export async function resetRepositoryHard(repoId: string, worktreePath: string): Promise<ExecResult> {
  return postServerJson('/api/repo/reset-hard', { repoId, worktreePath })
}

export async function alignRepositoryWorktreeToRemote(
  repoId: string,
  branch: string,
  worktreePath: string,
  signal?: AbortSignal,
  sourceToken?: string,
  previewToken?: string,
): Promise<ExecResult> {
  return postServerJson(
    '/api/repo/align-remote',
    { repoId, branch, worktreePath, sourceToken, previewToken },
    { signal },
  )
}

export async function getRepositoryRemoteAlignmentPreview(
  repoId: string,
  branch: string,
  worktreePath: string,
  signal?: AbortSignal,
): Promise<RepositoryRemoteAlignmentPreviewResult> {
  return postServerJson('/api/repo/align-remote-preview', { repoId, branch, worktreePath }, { signal })
}

export async function discardRepositoryChanges(
  repoId: string,
  worktreePath: string,
  paths: string[],
): Promise<ExecResult> {
  return postServerJson('/api/repo/discard-changes', { repoId, worktreePath, paths })
}
