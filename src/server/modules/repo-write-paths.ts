import { runServerCancellable, abortServerNetworkOp } from '#/server/common/network-ops.ts'
import { getRepositoryRemoteBranchInfo } from '#/server/modules/repo-read-paths.ts'
import {
  findRepositoryStatus,
  normalizedStatusEntries,
  repositoryPlanFingerprint,
} from '#/server/modules/repository-status-plan.ts'
import { publishRepoQueryInvalidation } from '#/server/modules/invalidation-broker.ts'
import { assertBranchWorkspaceFileMutationAllowed } from '#/server/modules/branch-workspace-protected-paths.ts'
import { gitNetworkOptionsFromPrefs } from '#/server/modules/git-network-settings.ts'
import {
  isValidRepositoryWorktreePath,
  resolveRemoteRepoTarget,
  resolveRepoBackend,
  runWithRepoBackend,
} from '#/server/modules/repo-backend.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import { cloneRepository as cloneGitRepository } from '#/system/git/clone.ts'
import { initRepository as gitInit } from '#/system/git/init.ts'
import { createLocalTag as createLocalGitTag, deleteLocalTag as deleteLocalGitTag } from '#/system/git/tags.ts'
import {
  createLocalFileTreeDirectory,
  createLocalFileTreeFile,
  deleteLocalFileTreeEntries,
  moveLocalFileTreeEntries,
  replaceLocalFileTreeBinaryFile,
  renameLocalFileTreeEntry,
  replaceLocalFileTreeTextFile,
} from '#/system/file-tree/local.ts'
import {
  createRemoteFileTreeDirectory,
  createRemoteFileTreeFile,
  deleteRemoteFileTreeEntries,
  moveRemoteFileTreeEntries,
  replaceRemoteFileTreeBinaryFile,
  renameRemoteFileTreeEntry,
  replaceRemoteFileTreeTextFile,
} from '#/system/ssh/git.ts'
import { openInPreferredEditor } from '#/system/editors.ts'
import { openInPreferredTerminal } from '#/system/terminals.ts'
import type { ExecResult, WorktreeContentState } from '#/shared/git-types.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import type { RepoFileTreeBinaryFileReplaceResult, RepoFileTreeTextFileReplaceResult } from '#/shared/file-tree.ts'
import { isRemoteRepoId, type NetworkOpKind, type RepoSnapshot } from '#/shared/rpc.ts'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { checkGitAvailable } from '#/system/git/helper.ts'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { type CloneRepoResult } from '#/shared/rpc.ts'
import { isProtectedRemoteBranchRef, parseRemoteBranchInput, parseRemoteBranchRef } from '#/shared/remote-branches.ts'
import {
  normalizeRepositoryMergeBranchSelection,
  repositoryMergeBranchFullRef,
  type RepositoryMergeBranchSelection,
} from '#/shared/repository-merge-branch.ts'
import { parseRemoteTagInput } from '#/shared/remote-tags.ts'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import PQueue from 'p-queue'
import {
  isAbsoluteWorktreePath,
  isRemoteTrackingRef,
  isSafeRemoteName,
  normalizeCreateWorktreeInput,
  type CreateWorktreeInput,
  type CreateWorktreeMode,
} from '#/shared/worktree-create.ts'
import type { WorktreeBootstrapDecision } from '#/shared/worktree-bootstrap-summary.ts'
import type { WorktreeBranchSwitchTarget } from '#/shared/worktree-branch-switch.ts'
import type { RepositoryRemoteAlignmentPreviewResult } from '#/shared/repository-remote-alignment.ts'

type ProbeAvailability = { ok: true } | { ok: false; message: string }

export interface RepoMutationInvalidationOptions {
  publishInvalidation?: boolean
}

export interface RepoRemoteAlignmentOptions extends RepoMutationInvalidationOptions {
  expectedFingerprint?: string
  previewToken?: string
}

export interface RepoPushOptions extends RepoMutationInvalidationOptions {
  createUpstreamRemote?: string
}

const MAX_CLONE_URL_LENGTH = 4096
const MAX_CLONE_DIR_NAME_LENGTH = 255
const CLONE_URL_SCHEME_RE = /^(?:https?|ssh|git|file):\/\/\S+$/i
const SCP_LIKE_CLONE_URL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+:[^\s]+$/
const CLONE_OPERATION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const INVALIDATION_SOURCE_TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/
const activeCloneControllers = new Map<string, AbortController>()
const activeBackgroundFetches = new Map<string, Promise<{ ok: boolean; message: string }>>()
const createWorktreeOperationQueuesByRepo = new Map<string, PQueue>()

async function getGitNetworkOptions() {
  return gitNetworkOptionsFromPrefs(await getServerSettingsPrefs())
}

async function getGitNetworkOptionsForBackend(backend: { id: string; kind: 'local' | 'remote' }) {
  if (backend.kind === 'remote' && parseRemoteRepoId(backend.id)?.transport !== 'wsl') return undefined
  return await getGitNetworkOptions()
}

async function probeWritableDirectory(cwd: string): Promise<ProbeAvailability> {
  try {
    const stat = await fs.stat(cwd)
    if (!stat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }
    await fs.access(cwd, fsConstants.R_OK | fsConstants.W_OK)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: classifyPathProbeError(err) }
  }
}

async function ensureWritableDirectory(cwd: string): Promise<ProbeAvailability> {
  try {
    await fs.mkdir(cwd, { recursive: true })
  } catch (err) {
    return { ok: false, message: classifyPathProbeError(err) }
  }
  return await probeWritableDirectory(cwd)
}

function classifyPathProbeError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : ''
  if (code === 'ENOENT') return 'error.path-not-found'
  if (code === 'ENOTDIR') return 'error.path-not-directory'
  if (code === 'EACCES' || code === 'EPERM') return 'error.path-permission-denied'
  return 'error.invalid-path'
}

function isValidCloneUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CLONE_URL_LENGTH &&
    !/[\0-\x1f\x7f]/.test(value) &&
    (CLONE_URL_SCHEME_RE.test(value) || SCP_LIKE_CLONE_URL_RE.test(value))
  )
}

function isValidCloneDirectoryName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CLONE_DIR_NAME_LENGTH &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/:\0]/.test(value)
  )
}

function isValidCloneOperationId(value: unknown): value is string {
  return typeof value === 'string' && CLONE_OPERATION_ID_RE.test(value)
}

function normalizeInvalidationSourceToken(value: unknown): string | undefined {
  return typeof value === 'string' && INVALIDATION_SOURCE_TOKEN_RE.test(value) ? value : undefined
}

function repoSnapshotInvalidationEvent(cwd: string, sourceToken?: string) {
  const normalizedSourceToken = normalizeInvalidationSourceToken(sourceToken)
  return normalizedSourceToken
    ? { repoId: cwd, query: 'repo-snapshot' as const, sourceToken: normalizedSourceToken }
    : { repoId: cwd, query: 'repo-snapshot' as const }
}

function publishRepoSnapshotInvalidation(cwd: string, sourceToken?: string): void {
  publishRepoQueryInvalidation(repoSnapshotInvalidationEvent(cwd, sourceToken))
}

export function publishRepositorySnapshotInvalidation(cwd: string, sourceToken?: string): void {
  publishRepoSnapshotInvalidation(cwd, sourceToken)
}

async function publishSnapshotInvalidationAfterMutation(
  cwd: string,
  result: ExecResult,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!result.ok || options?.publishInvalidation === false) return result
  publishRepoSnapshotInvalidation(cwd, sourceToken)
  return result
}

function publishSnapshotInvalidationAfterGitAttempt(
  cwd: string,
  result: ExecResult,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): ExecResult {
  if (options?.publishInvalidation !== false) publishRepoSnapshotInvalidation(cwd, sourceToken)
  return result
}

function isSafeRelativeGitPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false
  if (value.startsWith('/')) return false
  return !value.split('/').some((part) => part === '..')
}

function normalizeDiscardPaths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.length === 0) return null
  const paths = value.filter(isSafeRelativeGitPath)
  return paths.length === value.length ? paths : null
}

async function withMergedAbortSignal<T>(
  signals: Array<AbortSignal | undefined>,
  task: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  const activeSignals = signals.filter((signal): signal is AbortSignal => !!signal)
  if (activeSignals.length <= 1) return await task(activeSignals[0])
  if (typeof AbortSignal.any === 'function') return await task(AbortSignal.any(activeSignals))
  const ctrl = new AbortController()
  const abort = (event: Event) => {
    ctrl.abort((event.target as AbortSignal | null)?.reason)
  }
  for (const signal of activeSignals) {
    if (signal.aborted) {
      ctrl.abort(signal.reason)
      return await task(ctrl.signal)
    }
    signal.addEventListener('abort', abort)
  }
  try {
    return await task(ctrl.signal)
  } finally {
    for (const signal of activeSignals) signal.removeEventListener('abort', abort)
  }
}

async function runUserNetworkMutation(
  cwd: string,
  signal: AbortSignal | undefined,
  sourceToken: string | undefined,
  task: (signal: AbortSignal | undefined) => Promise<ExecResult>,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  return await publishSnapshotInvalidationAfterMutation(
    cwd,
    await runServerCancellable(cwd, 'user', async (networkSignal) => {
      return await withMergedAbortSignal([signal, networkSignal], task)
    }),
    sourceToken,
    options,
  )
}

export async function cloneRepository(
  operationId: string,
  url: string,
  parentPath: string,
  directoryName: string,
): Promise<CloneRepoResult> {
  if (!isValidCloneOperationId(operationId)) return { ok: false, message: 'error.invalid-arguments' }
  const repoUrl = typeof url === 'string' ? url.trim() : ''
  const targetParent = typeof parentPath === 'string' ? parentPath.trim() : ''
  const targetName = typeof directoryName === 'string' ? directoryName.trim() : ''
  if (!isValidCloneUrl(repoUrl) || !isValidCloneDirectoryName(targetName)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  if (!isValidCwd(targetParent)) return { ok: false, message: 'error.invalid-path' }
  const gitAvailable = await checkGitAvailable()
  if (!gitAvailable.ok) return gitAvailable
  const writable = await ensureWritableDirectory(targetParent)
  if (!writable.ok) return writable
  if (activeCloneControllers.has(operationId)) return { ok: false, message: 'error.network-op-in-progress' }
  const networkOptions = await getGitNetworkOptions()
  const ctrl = new AbortController()
  activeCloneControllers.set(operationId, ctrl)
  try {
    return await cloneGitRepository(targetParent, targetName, repoUrl, ctrl.signal, networkOptions)
  } finally {
    if (activeCloneControllers.get(operationId) === ctrl) activeCloneControllers.delete(operationId)
  }
}

export function abortCloneOperation(operationId: string): boolean {
  if (!isValidCloneOperationId(operationId)) return false
  const active = activeCloneControllers.get(operationId)
  if (!active) return false
  active.abort()
  return true
}

export async function fetchRepository(
  cwd: string,
  kind: NetworkOpKind = 'user',
  sourceToken?: string,
): Promise<{ ok: boolean; message: string }> {
  async function runFetch(task: (signal: AbortSignal) => Promise<{ ok: boolean; message: string }>) {
    const result = await runServerCancellable(cwd, kind, task)
    if (result.ok) publishRepoSnapshotInvalidation(cwd, sourceToken)
    return result
  }
  async function executeFetch(): Promise<{ ok: boolean; message: string }> {
    return await runWithRepoBackend(cwd, async (backend) => {
      const networkOptions = await getGitNetworkOptionsForBackend(backend)
      return await runFetch((signal) => backend.fetch(signal, networkOptions))
    })
  }

  if (kind === 'user') {
    const backgroundFetch = activeBackgroundFetches.get(cwd)
    if (backgroundFetch) return await backgroundFetch
    return await executeFetch()
  }

  const existingBackgroundFetch = activeBackgroundFetches.get(cwd)
  if (existingBackgroundFetch) return await existingBackgroundFetch
  const backgroundFetch = executeFetch().finally(() => {
    if (activeBackgroundFetches.get(cwd) === backgroundFetch) activeBackgroundFetches.delete(cwd)
  })
  activeBackgroundFetches.set(cwd, backgroundFetch)
  return await backgroundFetch
}

export async function fetchRepositoryRemote(
  cwd: string,
  remote: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd) || !isSafeRemoteName(remote)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(
    cwd,
    signal,
    sourceToken,
    async (mergedSignal) => await backend.fetchRemote(remote, mergedSignal, networkOptions),
    options,
  )
}

export async function checkoutRepositoryBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(cwd, await backend.checkout(branch, signal), sourceToken)
  })
}

export async function pullRepositoryBranch(
  cwd: string,
  branch: string,
  worktreePath?: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(
    cwd,
    signal,
    sourceToken,
    async (mergedSignal) => await backend.pull(branch, worktreePath, mergedSignal, networkOptions),
    options,
  )
}

export async function pushRepositoryBranch(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoPushOptions,
): Promise<ExecResult> {
  if (options?.createUpstreamRemote !== undefined && !isSafeRemoteName(options.createUpstreamRemote)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(
    cwd,
    signal,
    sourceToken,
    async (mergedSignal) => await backend.push(branch, mergedSignal, networkOptions, options?.createUpstreamRemote),
    options,
  )
}

export async function pushRepositoryWorktreeHeadToRemoteBranch(
  repoId: string,
  worktreePath: string,
  remoteRef: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  const parsed = parseRemoteBranchRef(remoteRef)
  if (!isValidRepoLocator(repoId) || !isValidRepositoryWorktreePath(repoId, worktreePath) || !parsed) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const backend = await resolveRepoBackend(repoId)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(
    repoId,
    signal,
    sourceToken,
    async (mergedSignal) =>
      await backend.pushWorktreeHeadToRemoteBranch(
        worktreePath,
        parsed.remote,
        parsed.branch,
        mergedSignal,
        networkOptions,
      ),
    options,
  )
}

export async function createRepositoryWorktree(
  cwd: string,
  input: CreateWorktreeInput,
  worktreeBootstrap: WorktreeBootstrapDecision,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  if (!isWorktreePathInputAbsolute(input)) return { ok: false, message: 'error.invalid-path' }
  const normalized = normalizeCreateWorktreeInput(input)
  if (!normalized) return { ok: false, message: 'error.invalid-arguments' }
  return await runCreateWorktreeServiceOperation(cwd, async () => {
    const result = await runWithRepoBackend(cwd, async (backend) => {
      if (!normalized.syncBeforeCreate) {
        return await backend.createWorktree(normalized, signal, { worktreeBootstrap })
      }
      const networkOptions = await getGitNetworkOptionsForBackend(backend)
      return await runServerCancellable(cwd, 'user', async (networkSignal) => {
        return await withMergedAbortSignal([signal, networkSignal], async (mergedSignal) => {
          const synchronized = await synchronizeWorktreeCreationSource(
            backend,
            normalized.mode,
            mergedSignal,
            networkOptions,
          )
          if (!synchronized.ok) return synchronized
          const created = await backend.createWorktree(normalized, mergedSignal, { worktreeBootstrap })
          return created.ok ? created : { ...created, repoChanged: true }
        })
      })
    })
    return result.ok || result.repoChanged
      ? publishSnapshotInvalidationAfterGitAttempt(cwd, result, sourceToken, options)
      : result
  })
}

async function synchronizeWorktreeCreationSource(
  backend: Awaited<ReturnType<typeof resolveRepoBackend>>,
  mode: CreateWorktreeMode,
  signal?: AbortSignal,
  networkOptions?: Awaited<ReturnType<typeof getGitNetworkOptions>>,
): Promise<ExecResult> {
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (mode.kind === 'newBranch' && mode.creationBase.kind === 'remoteBranch') {
    const slash = mode.creationBase.remoteRef.indexOf('/')
    return await backend.fetchRemote(mode.creationBase.remoteRef.slice(0, slash), signal, networkOptions)
  }

  const branch =
    mode.kind === 'existingBranch'
      ? mode.branch
      : mode.kind === 'newBranch' && mode.creationBase.kind === 'localBranch'
        ? mode.creationBase.branch
        : null
  if (!branch) return { ok: false, message: 'error.invalid-arguments' }

  const snapshot = await backend.getSnapshot(signal, { includeWorktreeStatus: false, includeRemote: false })
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  const source = snapshot?.branches.find((candidate) => candidate.name === branch)
  if (!source?.tracking || source.trackingGone || !isRemoteTrackingRef(source.tracking)) {
    return { ok: false, message: 'error.worktree-sync-unavailable' }
  }
  return await backend.pull(branch, source.worktree?.path, signal, networkOptions)
}

async function runCreateWorktreeServiceOperation<T>(repoId: string, task: () => Promise<T>): Promise<T> {
  const queue = createWorktreeOperationQueueForRepo(repoId)
  try {
    return await queue.add(task)
  } finally {
    scheduleCreateWorktreeOperationQueueCleanup(repoId, queue)
  }
}

function createWorktreeOperationQueueForRepo(repoId: string): PQueue {
  let queue = createWorktreeOperationQueuesByRepo.get(repoId)
  if (!queue) {
    queue = new PQueue({ concurrency: 1 })
    createWorktreeOperationQueuesByRepo.set(repoId, queue)
  }
  return queue
}

function scheduleCreateWorktreeOperationQueueCleanup(repoId: string, queue: PQueue): void {
  void queue.onIdle().then(() => {
    if (createWorktreeOperationQueuesByRepo.get(repoId) !== queue) return
    if (queue.size === 0 && queue.pending === 0) createWorktreeOperationQueuesByRepo.delete(repoId)
  })
}

export async function createRepositoryBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.createBranch(branch, baseBranch, signal),
      sourceToken,
    )
  })
}

export async function trackRepositoryRemoteBranch(
  cwd: string,
  localBranch: string,
  remoteRef: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.trackRemoteBranch(localBranch, remoteRef, signal),
      sourceToken,
    )
  })
}

export async function setRepositoryBranchUpstream(
  cwd: string,
  branch: string,
  remoteRef: string | null,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.setBranchUpstream(branch, remoteRef, signal),
      sourceToken,
      options,
    )
  })
}

function isWorktreePathInputAbsolute(input: CreateWorktreeInput): boolean {
  return isAbsoluteWorktreePath(typeof input.worktreePath === 'string' ? input.worktreePath.trim() : '')
}

export async function getRepositoryRemoteBranches(cwd: string, signal?: AbortSignal): Promise<string[]> {
  if (!isValidRepoLocator(cwd)) return []
  return await runWithRepoBackend(cwd, async (backend) => await backend.getRemoteBranches(signal))
}

export async function getRepositoryRemoteTags(cwd: string, signal?: AbortSignal): Promise<string[]> {
  if (!isValidRepoLocator(cwd)) return []
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await backend.getRemoteTags(signal, networkOptions)
}

export async function deleteRepositoryBranch(
  cwd: string,
  branch: string,
  options?: { force?: boolean; alsoDeleteUpstream?: boolean },
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.deleteBranch(branch, options, signal),
      sourceToken,
    )
  })
}

export async function deleteRepositoryRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const parsed = parseRemoteBranchInput(remote, branch)
  if (!parsed || isProtectedRemoteBranchRef(parsed.fullRef)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.deleteRemoteServerBranch(parsed.remote, parsed.branch, mergedSignal, networkOptions)
  })
}

export async function deleteRepositoryRemoteTag(
  cwd: string,
  remote: string,
  tag: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const parsed = parseRemoteTagInput(remote, tag)
  if (!parsed) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.deleteRemoteServerTag(parsed.remote, parsed.tag, mergedSignal, networkOptions)
  })
}

export async function createRepositoryLocalTag(
  cwd: string,
  name: string,
  ref: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  if (backend.kind === 'local') {
    const result = await createLocalGitTag(cwd, name, ref, signal)
    if (result.ok) publishSnapshotInvalidationAfterMutation(cwd, result, sourceToken)
    return result
  }
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.createLocalTag(name, ref, mergedSignal)
  })
}

export async function deleteRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  if (backend.kind === 'local') {
    const result = await deleteLocalGitTag(cwd, name, signal)
    if (result.ok) publishSnapshotInvalidationAfterMutation(cwd, result, sourceToken)
    return result
  }
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.deleteLocalTag(name, mergedSignal)
  })
}

export async function pushRepositoryLocalTag(
  cwd: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = await getGitNetworkOptionsForBackend(backend)
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.pushLocalTag(name, mergedSignal, networkOptions)
  })
}

export async function removeRepositoryWorktree(
  cwd: string,
  input: {
    branch?: string
    worktreePath: string
    alsoDeleteBranch: boolean
    forceRemoveWorktree?: boolean
    skipWorktreeStatus?: boolean
    forceDeleteBranch?: boolean
    alsoDeleteUpstream?: boolean
  },
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (input.alsoDeleteBranch && !input.branch) return { ok: false, message: 'error.invalid-arguments' }
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.removeWorktree(input, signal),
      sourceToken,
      options,
    )
  })
}

export async function cleanupRepositoryWorktree(
  cwd: string,
  worktreePath: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  return await runWithRepoBackend(cwd, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      cwd,
      await backend.cleanupWorktree(worktreePath, signal),
      sourceToken,
    )
  })
}

export async function openRepositoryRemote(cwd: string, branch?: string, signal?: AbortSignal): Promise<ExecResult> {
  const url = await runWithRepoBackend(cwd, async (backend) => await backend.getBrowserRemoteUrl(branch, signal))
  return url ? { ok: true, message: url } : { ok: false, message: 'error.no-remote-url' }
}

export async function openRepositoryTerminal(input: {
  projectRoot: string
  workingDirectory: string
}): Promise<ExecResult> {
  if (!isValidCwd(input.projectRoot) || !isValidCwd(input.workingDirectory)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const prefs = await getServerSettingsPrefs()
  return await openInPreferredTerminal({ ...input, terminalNumber: 1 }, prefs.terminalApp)
}

export async function openRepositoryEditor(target: EditorOpenTarget): Promise<ExecResult> {
  const prefs = await getServerSettingsPrefs()
  return await openInPreferredEditor(target, prefs.editorApp)
}

export function abortRepositoryOperation(cwd: string): boolean {
  if (!isValidRepoLocator(cwd)) return false
  return abortServerNetworkOp(cwd)
}

export async function renameRepositoryFileTreeEntry(
  repoId: string,
  worktreePath: string,
  oldPath: string,
  newName: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const allowed = await assertBranchWorkspaceFileMutationAllowed({
    rootId: repoId,
    kind: 'rename',
    worktreePath,
    paths: [oldPath],
    newName,
  })
  if (!allowed.ok) return allowed
  const result = isRemoteRepoId(repoId)
    ? await renameRemoteFileTreeEntry(await resolveRemoteRepoTarget(repoId), worktreePath, oldPath, newName, { signal })
    : await renameLocalFileTreeEntry(worktreePath, oldPath, newName)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function createRepositoryFileTreeDirectory(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const result = isRemoteRepoId(repoId)
    ? await createRemoteFileTreeDirectory(await resolveRemoteRepoTarget(repoId), worktreePath, parentDirPath, name, {
        signal,
      })
    : await createLocalFileTreeDirectory(worktreePath, parentDirPath, name)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function createRepositoryFileTreeFile(
  repoId: string,
  worktreePath: string,
  parentDirPath: string,
  name: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const result = isRemoteRepoId(repoId)
    ? await createRemoteFileTreeFile(await resolveRemoteRepoTarget(repoId), worktreePath, parentDirPath, name, {
        signal,
      })
    : await createLocalFileTreeFile(worktreePath, parentDirPath, name)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function replaceRepositoryFileTreeTextFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  content: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepoFileTreeTextFileReplaceResult> {
  const result = isRemoteRepoId(repoId)
    ? await replaceRemoteFileTreeTextFile(await resolveRemoteRepoTarget(repoId), worktreePath, filePath, content, {
        signal,
      })
    : await replaceLocalFileTreeTextFile(worktreePath, filePath, content)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function replaceRepositoryFileTreeBinaryFile(
  repoId: string,
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  const result = isRemoteRepoId(repoId)
    ? await replaceRemoteFileTreeBinaryFile(
        await resolveRemoteRepoTarget(repoId),
        worktreePath,
        filePath,
        bytesBase64,
        maxBytes,
        { signal },
      )
    : await replaceLocalFileTreeBinaryFile(worktreePath, filePath, bytesBase64, maxBytes)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function deleteRepositoryFileTreeEntries(
  repoId: string,
  worktreePath: string,
  paths: string[],
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const allowed = await assertBranchWorkspaceFileMutationAllowed({
    rootId: repoId,
    kind: 'delete',
    worktreePath,
    paths,
  })
  if (!allowed.ok) return allowed
  const result = isRemoteRepoId(repoId)
    ? await deleteRemoteFileTreeEntries(await resolveRemoteRepoTarget(repoId), worktreePath, paths, { signal })
    : await deleteLocalFileTreeEntries(worktreePath, paths)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function moveRepositoryFileTreeEntries(
  repoId: string,
  worktreePath: string,
  paths: string[],
  targetDirPath: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const allowed = await assertBranchWorkspaceFileMutationAllowed({
    rootId: repoId,
    kind: 'move',
    worktreePath,
    paths,
    targetDirPath,
  })
  if (!allowed.ok) return allowed
  const result = isRemoteRepoId(repoId)
    ? await moveRemoteFileTreeEntries(await resolveRemoteRepoTarget(repoId), worktreePath, paths, targetDirPath, {
        signal,
      })
    : await moveLocalFileTreeEntries(worktreePath, paths, targetDirPath)
  if (result.ok) publishRepoSnapshotInvalidation(repoId, sourceToken)
  return result
}

export async function checkoutWorktreeBranch(
  repoId: string,
  worktreePath: string,
  target: WorktreeBranchSwitchTarget,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      repoId,
      await backend.checkoutWorktree(worktreePath, target, signal),
      sourceToken,
    )
  })
}

export async function commitRepositoryChanges(
  repoId: string,
  worktreePath: string,
  message: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      repoId,
      await backend.commitAll(worktreePath, message, signal),
      sourceToken,
      options,
    )
  })
}

export async function mergeRepositoryBranch(
  repoId: string,
  worktreePath: string,
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      repoId,
      await backend.merge(worktreePath, branch, signal),
      sourceToken,
      options,
    )
  })
}

export async function mergeRepositoryBranchSelection(
  repoId: string,
  worktreePath: string,
  source: RepositoryMergeBranchSelection,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  const normalized = normalizeRepositoryMergeBranchSelection(source)
  if (!normalized) return { ok: false, message: 'error.invalid-arguments' }

  if (normalized.kind === 'remote') {
    const parsed = parseRemoteBranchRef(normalized.remoteRef)
    if (!parsed) return { ok: false, message: 'error.invalid-arguments' }
    const fetched = await fetchRepositoryRemote(repoId, parsed.remote, signal, sourceToken, {
      publishInvalidation: false,
    })
    if (!fetched.ok) return fetched
    const remoteBranches = await getRepositoryRemoteBranchInfo(repoId, signal)
    if (!remoteBranches.some((candidate) => candidate.remoteRef === normalized.remoteRef)) {
      publishRepoSnapshotInvalidation(repoId, sourceToken)
      return { ok: false, message: 'error.remote-branch-not-found' }
    }
  }

  return await mergeRepositoryBranch(
    repoId,
    worktreePath,
    repositoryMergeBranchFullRef(normalized),
    signal,
    sourceToken,
  )
}

export async function resetRepositoryHard(
  repoId: string,
  worktreePath: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      repoId,
      await backend.resetHard(worktreePath, signal),
      sourceToken,
    )
  })
}

function resolveRemoteAlignmentTarget(
  snapshot: RepoSnapshot | null,
  backendKind: 'local' | 'remote',
  branch: string,
  worktreePath: string,
): { ok: true; upstream: string; head: string; ahead: number } | { ok: false; message: string } {
  if (!snapshot) return { ok: false, message: 'error.failed-read-repo' }
  const candidate = snapshot.branches.find((item) => item.name === branch)
  const normalizePath = backendKind === 'remote' ? path.posix.normalize : path.resolve
  if (!candidate?.worktree || normalizePath(candidate.worktree.path) !== normalizePath(worktreePath)) {
    return { ok: false, message: 'error.worktree-not-found' }
  }
  if (candidate.trackingGone || !candidate.tracking || !parseRemoteBranchRef(candidate.tracking)) {
    return { ok: false, message: 'error.upstream-required' }
  }
  const head = candidate.worktree.head ?? candidate.lastCommitHash
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head)) {
    return { ok: false, message: 'error.failed-read-repo' }
  }
  return { ok: true, upstream: candidate.tracking, head: head.toLowerCase(), ahead: candidate.ahead }
}

type RemoteAlignmentState = {
  ok: true
  upstream: string
  head: string
  fingerprint: string
  contentState: WorktreeContentState
  ahead: number
  changeCount: number
}

async function readRemoteAlignmentState(
  repoId: string,
  backend: Awaited<ReturnType<typeof resolveRepoBackend>>,
  branch: string,
  worktreePath: string,
  signal?: AbortSignal,
): Promise<RemoteAlignmentState | { ok: false; message: string }> {
  const resolved = resolveRemoteAlignmentTarget(
    await backend.getSnapshot(signal, { includeWorktreeStatus: false, includeRemote: false }),
    backend.kind,
    branch,
    worktreePath,
  )
  if (!resolved.ok) return resolved

  const [entries, contentState] = await Promise.all([
    backend.getWorktreeStatusEntries
      ? backend.getWorktreeStatusEntries(worktreePath, signal)
      : backend
          .getStatus(signal)
          .then((statuses) => findRepositoryStatus(repoId, statuses, worktreePath)?.entries ?? null),
    backend.getWorktreeContentState(worktreePath, signal),
  ])
  if (signal?.aborted) return { ok: false, message: 'cancelled' }
  if (!entries || !contentState) return { ok: false, message: 'error.failed-read-repo' }
  return {
    ok: true,
    upstream: resolved.upstream,
    head: resolved.head,
    contentState,
    ahead: resolved.ahead,
    changeCount: entries.length,
    fingerprint: repositoryPlanFingerprint({
      head: resolved.head,
      status: normalizedStatusEntries(entries),
      contentState,
      upstream: resolved.upstream,
      trackingGone: false,
    }),
  }
}

function remoteAlignmentPreviewToken(
  repoId: string,
  branch: string,
  worktreePath: string,
  fingerprint: string,
): string {
  return repositoryPlanFingerprint({ repoId, branch, worktreePath, fingerprint })
}

export async function buildRepositoryRemoteAlignmentPreview(
  repoId: string,
  branch: string,
  worktreePath: string,
  signal?: AbortSignal,
): Promise<RepositoryRemoteAlignmentPreviewResult> {
  if (
    !isValidRepoLocator(repoId) ||
    !isValidRepositoryWorktreePath(repoId, worktreePath) ||
    typeof branch !== 'string' ||
    branch.trim() === ''
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    const state = await readRemoteAlignmentState(repoId, backend, branch, worktreePath, signal)
    if (!state.ok) return state
    return {
      ok: true,
      token: remoteAlignmentPreviewToken(repoId, branch, worktreePath, state.fingerprint),
      repoId,
      branch,
      worktreePath,
      upstream: state.upstream,
      ahead: state.ahead,
      changeCount: state.changeCount,
    }
  })
}

export async function alignRepositoryWorktreeToRemote(
  repoId: string,
  branch: string,
  worktreePath: string,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoRemoteAlignmentOptions,
): Promise<ExecResult> {
  if (
    !isValidRepoLocator(repoId) ||
    !isValidRepositoryWorktreePath(repoId, worktreePath) ||
    typeof branch !== 'string' ||
    branch.trim() === ''
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  if (!options?.expectedFingerprint && !options?.previewToken) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  let gitAttempted = false
  const result = await runUserNetworkMutation(
    repoId,
    signal,
    sourceToken,
    async (mergedSignal) =>
      await runWithRepoBackend(repoId, async (backend) => {
        const initial = resolveRemoteAlignmentTarget(
          await backend.getSnapshot(mergedSignal, { includeWorktreeStatus: false, includeRemote: false }),
          backend.kind,
          branch,
          worktreePath,
        )
        if (!initial.ok) return initial
        const parsed = parseRemoteBranchRef(initial.upstream)
        if (!parsed) return { ok: false, message: 'error.upstream-required' }
        gitAttempted = true
        const fetched = await backend.fetchRemote(
          parsed.remote,
          mergedSignal,
          await getGitNetworkOptionsForBackend(backend),
        )
        if (!fetched.ok) return fetched
        const remoteBranches = await backend.getRemoteBranchInfo(mergedSignal)
        const remoteBranch = remoteBranches.find((candidate) => candidate.remoteRef === initial.upstream)
        if (!remoteBranch) {
          return { ok: false, message: 'error.remote-branch-not-found' }
        }
        return await backend.alignToRemoteRef(
          worktreePath,
          {
            branch,
            remoteRef: initial.upstream,
            remoteHead: remoteBranch.head,
          },
          mergedSignal,
        )
      }),
    options,
  )
  if (!result.ok && gitAttempted && options?.publishInvalidation !== false) {
    publishRepoSnapshotInvalidation(repoId, sourceToken)
  }
  return result
}

export async function discardRepositoryChanges(
  repoId: string,
  worktreePath: string,
  paths: unknown,
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  const normalizedPaths = normalizeDiscardPaths(paths)
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath) || !normalizedPaths) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return publishSnapshotInvalidationAfterGitAttempt(
      repoId,
      await backend.discardChanges(worktreePath, normalizedPaths, signal),
      sourceToken,
      options,
    )
  })
}

export async function initRepository(cwd: string): Promise<ExecResult> {
  if (!isValidCwd(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await gitInit(cwd)
}
