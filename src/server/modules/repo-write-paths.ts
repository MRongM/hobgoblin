import { runServerCancellable, abortServerNetworkOp } from '#/server/common/network-ops.ts'
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
import { type ExecResult } from '#/shared/git-types.ts'
import type { EditorOpenTarget } from '#/shared/file-path-target.ts'
import type { RepoFileTreeBinaryFileReplaceResult, RepoFileTreeTextFileReplaceResult } from '#/shared/file-tree.ts'
import { isRemoteRepoId, type NetworkOpKind } from '#/shared/rpc.ts'
import { checkGitAvailable } from '#/system/git/helper.ts'
import { isValidCwd, isValidRepoLocator } from '#/shared/input-validation.ts'
import { type CloneRepoResult } from '#/shared/rpc.ts'
import { isProtectedRemoteBranchRef, parseRemoteBranchInput } from '#/shared/remote-branches.ts'
import { parseRemoteTagInput } from '#/shared/remote-tags.ts'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import PQueue from 'p-queue'
import {
  isAbsoluteWorktreePath,
  normalizeCreateWorktreeInput,
  type CreateWorktreeInput,
} from '#/shared/worktree-create.ts'
import type { WorktreeBootstrapDecision } from '#/shared/worktree-bootstrap-summary.ts'

type ProbeAvailability = { ok: true } | { ok: false; message: string }

export interface RepoMutationInvalidationOptions {
  publishInvalidation?: boolean
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
      const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
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
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
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
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
  const backend = await resolveRepoBackend(cwd)
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(
    cwd,
    signal,
    sourceToken,
    async (mergedSignal) => await backend.push(branch, mergedSignal, networkOptions),
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
      return await backend.createWorktree(normalized, signal, { worktreeBootstrap })
    })
    return result.ok || result.repoChanged
      ? publishSnapshotInvalidationAfterGitAttempt(cwd, result, sourceToken, options)
      : result
  })
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
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
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
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
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
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
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
  const networkOptions = backend.kind === 'local' ? await getGitNetworkOptions() : undefined
  return await runUserNetworkMutation(cwd, signal, sourceToken, async (mergedSignal) => {
    return await backend.pushLocalTag(name, mergedSignal, networkOptions)
  })
}

export async function removeRepositoryWorktree(
  cwd: string,
  input: {
    branch: string
    worktreePath: string
    alsoDeleteBranch: boolean
    forceRemoveWorktree?: boolean
    forceDeleteBranch?: boolean
    alsoDeleteUpstream?: boolean
  },
  signal?: AbortSignal,
  sourceToken?: string,
  options?: RepoMutationInvalidationOptions,
): Promise<ExecResult> {
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
  branch: string,
  signal?: AbortSignal,
  sourceToken?: string,
): Promise<ExecResult> {
  if (!isValidRepoLocator(repoId) || !isAbsoluteWorktreePath(worktreePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await runWithRepoBackend(repoId, async (backend) => {
    return await publishSnapshotInvalidationAfterMutation(
      repoId,
      await backend.checkoutWorktree(worktreePath, branch, signal),
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

export async function discardRepositoryChanges(
  repoId: string,
  worktreePath: string,
  paths: unknown,
  signal?: AbortSignal,
  sourceToken?: string,
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
    )
  })
}

export async function initRepository(cwd: string): Promise<ExecResult> {
  if (!isValidCwd(cwd)) return { ok: false, message: 'error.invalid-arguments' }
  return await gitInit(cwd)
}
