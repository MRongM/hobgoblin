import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'
import type {
  BranchWorkspaceGitActionKind,
  BranchWorkspaceGitActionStep,
} from '#/shared/branch-workspace-git-actions.ts'
import {
  normalizeWorktreeCreationBase,
  normalizeCreateWorktreeInput,
  type CreateWorktreeMode,
  type WorktreeCreationBase,
} from '#/shared/worktree-create.ts'
import {
  normalizeWorktreeBootstrapSourcePath,
  normalizeWorktreeBootstrapSelections,
  type WorktreeBootstrapDecision,
} from '#/shared/worktree-bootstrap-summary.ts'

/** Portable safe single directory name. Prefixes are only a legacy discovery convention. */
export function isSafeBranchWorkspaceFolderName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    isWorkspaceRepositoryName(value) &&
    value.length <= 255 &&
    !/[\x00-\x1f\x7f<>:"|?*]/.test(value) &&
    !/[. ]$/.test(value) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) &&
    value !== '.git'
  )
}

export type BranchWorkspaceMemberKind = 'worktree' | 'repository'
export type BranchWorkspaceMemberSource = { kind: 'repository'; repositoryId: string } | { kind: 'url'; url: string }

export const BRANCH_WORKSPACE_DIRECTORY_PREFIX = 'hob-'
export const BRANCH_WORKSPACE_DIRECTORY_PREFIXES = [BRANCH_WORKSPACE_DIRECTORY_PREFIX, 'hobgoblin-', 'goblin-'] as const

export function isBranchWorkspaceDirectoryName(value: string): boolean {
  return (
    isWorkspaceRepositoryName(value) && BRANCH_WORKSPACE_DIRECTORY_PREFIXES.some((prefix) => value.startsWith(prefix))
  )
}

export function isManagedBranchWorkspaceEntryName(value: string): boolean {
  return (
    isBranchWorkspaceDirectoryName(value) ||
    BRANCH_WORKSPACE_DIRECTORY_PREFIXES.some((prefix) => value.startsWith(`.${prefix}`))
  )
}

export type BranchWorkspaceProgress = 'pending' | 'complete' | 'removed' | 'failed'
export type BranchWorkspaceOperationKind = 'create' | 'extend' | 'reduce' | 'repair' | 'remove'
export type BranchWorkspaceBranchOrigin = 'created' | 'pre-existing'
export type BranchWorkspaceAuxiliaryMode = 'symlink' | 'copy'
export type BranchWorkspacePathKind = 'file' | 'directory' | 'symlink' | 'other' | 'missing'

export interface BranchWorkspacePathInspection {
  path: string
  exists: boolean
  kind: BranchWorkspacePathKind
  resolvedPath?: string
  linkTarget?: string
  directChild: boolean
  outsideRoot: boolean
}

export interface BranchWorkspaceAuxiliaryCandidate {
  name: string
  path: string
  kind: Exclude<BranchWorkspacePathKind, 'missing'>
  resolvedPath?: string
  outsideRoot: boolean
}

export interface BranchWorkspaceRepositoryMember {
  repositoryName: string
  kind?: BranchWorkspaceMemberKind
  source?: BranchWorkspaceMemberSource
  memberId?: string
  mode?: CreateWorktreeMode
  /** Runtime only. Null denotes detached HEAD; persistence retains creation intent. */
  currentBranch?: string | null
  head?: string
  /** Authoritative Git identity; complete members always own their target repository. */
  repositoryId?: string
  targetBranch: string
  creationBase: WorktreeCreationBase
  syncBeforeCreate: boolean
  branchOrigin: BranchWorkspaceBranchOrigin
  worktreePath: string
  progress: BranchWorkspaceProgress
  branchCleanupProgress?: BranchWorkspaceProgress
  upstreamCleanupProgress?: BranchWorkspaceProgress
  lastError?: string
}

export interface BranchWorkspaceAuxiliaryEntry {
  name: string
  mode: BranchWorkspaceAuxiliaryMode
  sourcePath: string
  targetPath: string
  copyBaseline?: string
  progress: BranchWorkspaceProgress
  lastError?: string
}

export interface BranchWorkspaceOperationSnapshot {
  kind: BranchWorkspaceOperationKind
}

export interface BranchWorkspaceManifest {
  id: string
  rootId: string
  branch: string
  directoryName: string
  path: string
  repositories: BranchWorkspaceRepositoryMember[]
  auxiliaryEntries: BranchWorkspaceAuxiliaryEntry[]
  operation?: BranchWorkspaceOperationSnapshot
}

export interface BranchWorkspaceRepositorySnapshot extends BranchWorkspaceRepositoryMember {
  ready: boolean
}

export interface BranchWorkspaceAuxiliarySnapshot extends BranchWorkspaceAuxiliaryEntry {
  ready: boolean
  resolvedSourcePath?: string
}

export interface BranchWorkspaceActiveMemberOperation {
  repositoryName: string
  step: BranchWorkspaceGitActionStep
}

export interface BranchWorkspaceActiveOperation {
  kind: BranchWorkspaceGitActionKind
  currentStep: number
  completedCount: number
  totalCount: number
  cancellable: boolean
  activeMembers?: BranchWorkspaceActiveMemberOperation[]
  completedRepositoryNames?: string[]
  repositoryName?: string
  step?: BranchWorkspaceGitActionStep
}

export type BranchWorkspaceIssueKind =
  | 'root-missing'
  | 'root-not-directory'
  | 'repository-unavailable'
  | 'repository-pending'
  | 'repository-failed'
  | 'worktree-missing'
  | 'worktree-path-mismatch'
  | 'auxiliary-missing'
  | 'auxiliary-pending'
  | 'auxiliary-failed'
  | 'auxiliary-path-mismatch'

export interface BranchWorkspaceIssue {
  kind: BranchWorkspaceIssueKind
  repositoryName?: string
  entryName?: string
  message?: string
}

export type BranchWorkspaceState =
  | { kind: 'ready' }
  | {
      kind: 'needs-action'
      action: 'repair'
      reason: 'creation-interrupted' | 'drift'
    }
  | { kind: 'needs-action'; action: 'continue-reduce' }
  | { kind: 'needs-action'; action: 'continue-delete' }

export interface BranchWorkspaceSnapshot {
  id: string
  rootId: string
  branch: string
  directoryName: string
  path: string
  state: BranchWorkspaceState
  available: boolean
  issues: BranchWorkspaceIssue[]
  repositories: BranchWorkspaceRepositorySnapshot[]
  auxiliaryEntries: BranchWorkspaceAuxiliarySnapshot[]
  activeOperation?: BranchWorkspaceActiveOperation
}

export function isBranchWorkspaceRootUsable(workspace: BranchWorkspaceSnapshot): boolean {
  return (
    workspace.available &&
    !workspace.activeOperation &&
    (workspace.state.kind === 'ready' || workspace.state.action === 'repair')
  )
}

export interface BranchWorkspaceRepositorySelection {
  kind?: BranchWorkspaceMemberKind
  source?: BranchWorkspaceMemberSource
  memberId?: string
  targetBranch?: string
  mode?: CreateWorktreeMode
  repositoryName: string
  creationBase: WorktreeCreationBase
  syncBeforeCreate: boolean
  worktreeBootstrap?: WorktreeBootstrapDecision
}

export interface BranchWorkspaceAuxiliarySelection {
  name: string
  mode: BranchWorkspaceAuxiliaryMode
}

export type BranchWorkspacePlanRequest =
  | {
      operation: 'create'
      directoryName?: string
      branchWorkspaceId?: string
      branch: string
      repositories: BranchWorkspaceRepositorySelection[]
      auxiliaryEntries: BranchWorkspaceAuxiliarySelection[]
    }
  | { operation: 'repair'; branchWorkspaceId: string }
  | {
      operation: 'reduce'
      branchWorkspaceId: string
      repositories: string[]
    }
  | {
      operation: 'remove'
      branchWorkspaceId: string
      alsoDeleteBranch: boolean
      alsoDeleteUpstream: boolean
    }

export type BranchWorkspaceApproval =
  | 'delete-repository'
  | 'outside-root-source'
  | 'worktree-bootstrap'
  | 'discard-member-changes'
  | 'modified-copy'
  | 'unmanaged-content'
  | 'close-terminals'

export function isBranchWorkspaceApproval(value: unknown): value is BranchWorkspaceApproval {
  return (
    value === 'delete-repository' ||
    value === 'outside-root-source' ||
    value === 'worktree-bootstrap' ||
    value === 'discard-member-changes' ||
    value === 'modified-copy' ||
    value === 'unmanaged-content' ||
    value === 'close-terminals'
  )
}

export type BranchWorkspacePlanStepKind =
  | 'create-directory'
  | 'clone-repository'
  | 'create-worktree'
  | 'symlink-entry'
  | 'copy-entry'
  | 'remove-worktree'
  | 'remove-entry'
  | 'delete-local-branch'
  | 'delete-upstream-branch'
  | 'remove-directory'

export interface BranchWorkspacePlanStep {
  id: string
  kind: BranchWorkspacePlanStepKind
  label: string
  repositoryName?: string
  entryName?: string
}

export interface BranchWorkspaceRepositoryPlan {
  kind?: BranchWorkspaceMemberKind
  source?: BranchWorkspaceMemberSource
  memberId?: string
  repositoryName: string
  repoId: string
  checkoutDefaultBranch?: boolean
  targetBranch: string
  checkedOutBranch?: string
  creationBase: WorktreeCreationBase
  syncBeforeCreate: boolean
  branchOrigin: BranchWorkspaceBranchOrigin
  worktreePath: string
  mode: CreateWorktreeMode
  worktreeBootstrap: WorktreeBootstrapDecision
  confirmationRequired: boolean
  satisfied: boolean
  action?: 'clone-repository' | 'create-worktree' | 'remove-worktree' | 'remove-entry' | 'delete-branch' | 'satisfied'
  pruneBeforeCreate?: boolean
  worktreePresent?: boolean
  deleteBranch?: boolean
  deleteUpstream?: boolean
  upstream?: string
  dirty?: boolean
  localOnlyCommits?: number
  repositoryFingerprint?: string
}

export interface BranchWorkspaceAuxiliaryPlan {
  name: string
  mode: BranchWorkspaceAuxiliaryMode
  sourcePath: string
  targetPath: string
  resolvedSourcePath?: string
  outsideRoot: boolean
  satisfied: boolean
  action?: 'materialize' | 'replace-symlink' | 'remove' | 'satisfied'
  modified?: boolean
}

export interface BranchWorkspacePlan {
  token: string
  rootId: string
  operation: BranchWorkspaceOperationKind
  branchWorkspaceId: string
  branch: string
  directoryName: string
  path: string
  manifest: BranchWorkspaceManifest
  repositories: BranchWorkspaceRepositoryPlan[]
  auxiliaryEntries: BranchWorkspaceAuxiliaryPlan[]
  requiredApprovals: BranchWorkspaceApproval[]
  steps: BranchWorkspacePlanStep[]
  terminalSessionIds: string[]
  unmanagedEntries?: string[]
  removalOptions?: {
    alsoDeleteBranch: boolean
    alsoDeleteUpstream: boolean
  }
}

export type BranchWorkspacePlanResult =
  | { ok: true; plan: BranchWorkspacePlan }
  | { ok: false; message: string; detail?: string }

export type BranchWorkspaceExecutionWarning =
  | {
      kind: 'repository-dependency-failed'
      repositoryName: string
      message: string
    }
  | {
      kind: 'workspace-dependency-failed'
      entryName: string
      message: string
    }
  | {
      kind: 'member-worktree-cleanup-failed'
      repositoryName: string
      message: string
    }

export type BranchWorkspaceExecuteResult =
  | {
      ok: true
      branchWorkspaceId: string
      snapshot?: BranchWorkspaceSnapshot
      warnings?: BranchWorkspaceExecutionWarning[]
    }
  | { ok: false; message: string; detail?: string; branchWorkspaceId?: string }

export interface BranchWorkspaceExecuteInput {
  planToken: string
  approvals: BranchWorkspaceApproval[]
  force?: boolean
  sourceToken?: string
}

export type BranchWorkspaceReorderResult = { ok: true } | { ok: false; message: string }

export type BranchWorkspaceRegistryCleanupResult =
  | {
      ok: true
      outcome: 'unchanged' | 'repaired' | 'reset'
      removedRecords: number
    }
  | { ok: false; message: string }

export type BranchWorkspaceReadResult =
  | {
      ok: true
      rootId: string
      items: BranchWorkspaceSnapshot[]
      auxiliaryCandidates: BranchWorkspaceAuxiliaryCandidate[]
      registryError?: string
    }
  | { ok: false; message: string }

export type BranchWorkspacePlanRequestResult =
  | { ok: true; request: BranchWorkspacePlanRequest }
  | { ok: false; message: string }

export function normalizeBranchWorkspacePlanRequest(value: unknown): BranchWorkspacePlanRequestResult {
  const request = asRecord(value)
  if (!request) return invalidRequest()

  if (request.operation === 'create') return normalizeCreateRequest(request)

  const branchWorkspaceId = normalizedText(request.branchWorkspaceId)
  if (!branchWorkspaceId) return invalidRequest()
  if (request.operation === 'repair') {
    return { ok: true, request: { operation: 'repair', branchWorkspaceId } }
  }
  if (request.operation === 'reduce') {
    if (!Array.isArray(request.repositories) || request.repositories.length === 0) return invalidRequest()
    const repositories: string[] = []
    const repositoryNames = new Set<string>()
    for (const value of request.repositories) {
      const repositoryName = normalizedText(value)
      if (!repositoryName || !isWorkspaceRepositoryName(repositoryName) || repositoryNames.has(repositoryName)) {
        return invalidRequest()
      }
      repositoryNames.add(repositoryName)
      repositories.push(repositoryName)
    }
    return { ok: true, request: { operation: 'reduce', branchWorkspaceId, repositories } }
  }
  if (request.operation !== 'remove') return invalidRequest()
  if (typeof request.alsoDeleteBranch !== 'boolean' || typeof request.alsoDeleteUpstream !== 'boolean') {
    return invalidRequest()
  }
  if (request.alsoDeleteUpstream && !request.alsoDeleteBranch) return invalidRequest()
  return {
    ok: true,
    request: {
      operation: 'remove',
      branchWorkspaceId,
      alsoDeleteBranch: request.alsoDeleteBranch,
      alsoDeleteUpstream: request.alsoDeleteUpstream,
    },
  }
}

function normalizeCreateRequest(request: Record<string, unknown>): BranchWorkspacePlanRequestResult {
  const directoryName = request.directoryName === undefined ? undefined : request.directoryName
  if (directoryName !== undefined && !isSafeBranchWorkspaceFolderName(directoryName)) return invalidRequest()
  const branch = directoryName === undefined ? normalizedText(request.branch) : (normalizedText(request.branch) ?? '')
  if (
    (directoryName === undefined && !branch) ||
    !Array.isArray(request.repositories) ||
    request.repositories.length === 0
  )
    return invalidRequest()
  if (!Array.isArray(request.auxiliaryEntries)) return invalidRequest()

  if (request.branchWorkspaceId !== undefined && !normalizedText(request.branchWorkspaceId)) return invalidRequest()
  const repositories: BranchWorkspaceRepositorySelection[] = []
  const memberIds = new Set<string>()
  const repositoryNames = new Set<string>()
  for (const value of request.repositories) {
    const repository = asRecord(value)
    const repositoryName = normalizedText(repository?.repositoryName)
    const hasCreationBase = repository ? 'creationBase' in repository : false
    const syncBeforeCreate = repository?.syncBeforeCreate ?? false
    const kind = repository?.kind
    if (kind !== undefined && kind !== 'worktree' && kind !== 'repository') return invalidRequest()
    const source =
      repository?.source === undefined ? undefined : normalizeBranchWorkspaceMemberSource(repository.source)
    if (repository?.source !== undefined && !source) return invalidRequest()
    if (source?.kind === 'url' && kind !== 'repository') return invalidRequest()
    const targetBranch = repository?.targetBranch === undefined ? undefined : normalizedText(repository.targetBranch)
    if (repository?.targetBranch !== undefined && !targetBranch) return invalidRequest()
    const memberId = repository?.memberId === undefined ? undefined : normalizedText(repository.memberId)
    if (repository?.memberId !== undefined && !memberId) return invalidRequest()
    const mode =
      repository?.mode === undefined
        ? undefined
        : normalizeCreateWorktreeInput({ worktreePath: '/member', mode: repository.mode })?.mode
    if (repository?.mode !== undefined && !mode) return invalidRequest()
    const modeTarget =
      mode?.kind === 'newBranch'
        ? mode.newBranch
        : mode?.kind === 'existingBranch'
          ? mode.branch
          : mode?.kind === 'trackRemoteBranch'
            ? mode.localBranch
            : undefined
    if (targetBranch && mode && targetBranch !== modeTarget) return invalidRequest()
    if (memberId && memberIds.has(memberId)) return invalidRequest()
    if (memberId) memberIds.add(memberId)
    if (syncBeforeCreate && mode && mode.kind !== 'newBranch' && mode.kind !== 'existingBranch') return invalidRequest()
    const creationBase = hasCreationBase
      ? normalizeWorktreeCreationBase(repository?.creationBase)
      : normalizeWorktreeCreationBase(
          mode?.kind === 'newBranch'
            ? mode.creationBase
            : {
                kind: 'localBranch',
                branch: repository?.baseBranch ?? (source?.kind === 'url' || mode ? 'main' : undefined),
              },
        )
    const hasWorktreeBootstrap = repository ? 'worktreeBootstrap' in repository : false
    const worktreeBootstrap = hasWorktreeBootstrap
      ? normalizeRepositoryWorktreeBootstrap(repository?.worktreeBootstrap)
      : undefined
    if (
      !repositoryName ||
      !isWorkspaceRepositoryName(repositoryName) ||
      !creationBase ||
      typeof syncBeforeCreate !== 'boolean' ||
      repositoryNames.has(repositoryName)
    ) {
      return invalidRequest()
    }
    repositoryNames.add(repositoryName)
    repositories.push({
      repositoryName,
      ...(kind ? { kind } : {}),
      ...(source ? { source } : {}),
      ...(targetBranch ? { targetBranch } : {}),
      ...(memberId ? { memberId } : {}),
      ...(mode ? { mode } : {}),
      creationBase,
      syncBeforeCreate,
      ...(worktreeBootstrap ? { worktreeBootstrap } : {}),
    })
  }

  const auxiliaryEntries: BranchWorkspaceAuxiliarySelection[] = []
  const auxiliaryNames = new Set<string>()
  for (const value of request.auxiliaryEntries) {
    const entry = asRecord(value)
    const name = normalizedText(entry?.name)
    if (
      !name ||
      !isWorkspaceRepositoryName(name) ||
      (entry?.mode !== 'symlink' && entry?.mode !== 'copy') ||
      auxiliaryNames.has(name) ||
      repositoryNames.has(name)
    ) {
      return invalidRequest()
    }
    auxiliaryNames.add(name)
    auxiliaryEntries.push({ name, mode: entry.mode })
  }

  return {
    ok: true,
    request: {
      operation: 'create',
      branch: branch!,
      ...(directoryName !== undefined ? { directoryName } : {}),
      ...(normalizedText(request.branchWorkspaceId)
        ? { branchWorkspaceId: normalizedText(request.branchWorkspaceId)! }
        : {}),
      repositories,
      auxiliaryEntries,
    },
  }
}

export function normalizeBranchWorkspaceMemberSource(value: unknown): BranchWorkspaceMemberSource | null {
  const source = asRecord(value)
  if (source?.kind === 'repository') {
    const repositoryId = normalizedText(source.repositoryId)
    return repositoryId ? { kind: 'repository', repositoryId } : null
  }
  if (source?.kind === 'url') {
    const url = normalizedText(source.url)
    return url &&
      url.length <= 4096 &&
      !url.startsWith('-') &&
      (/^(?:https?|ssh|git|file):\/\/\S+$/i.test(url) || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+:[^\s]+$/.test(url))
      ? { kind: 'url', url }
      : null
  }
  return null
}

function normalizeRepositoryWorktreeBootstrap(value: unknown): WorktreeBootstrapDecision {
  const decision = asRecord(value)
  if (!decision) return { kind: 'skip' }
  if (decision.kind === 'skip') return { kind: 'skip' }
  if (decision.kind !== 'materialize') return { kind: 'skip' }
  const selections = normalizeWorktreeBootstrapSelections(decision.selections)
  const sourceWorktreePath = normalizeWorktreeBootstrapSourcePath(decision.sourceWorktreePath)
  if (!sourceWorktreePath || selections.length === 0) return { kind: 'skip' }
  return {
    kind: 'materialize',
    selections,
    sourceWorktreePath,
  }
}

function invalidRequest(): BranchWorkspacePlanRequestResult {
  return { ok: false, message: 'error.invalid-arguments' }
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !text.includes('\0') && !/[\x00-\x1f\x7f]/.test(text) ? text : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
