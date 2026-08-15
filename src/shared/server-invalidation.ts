import { isRepoQueryInvalidationEvent, type RepoQueryInvalidationEvent } from '#/shared/repo-query-invalidation.ts'
import type { BranchWorkspaceActiveOperation } from '#/shared/branch-workspaces.ts'

export const SETTINGS_INVALIDATION_SCOPES = ['settings-snapshot', 'external-apps', 'i18n', 'theme'] as const

export type SettingsInvalidationScope = (typeof SETTINGS_INVALIDATION_SCOPES)[number]

export interface SettingsInvalidationEvent {
  type: 'settings-invalidated'
  scopes: SettingsInvalidationScope[]
}

export interface WorkspaceInvalidationEvent {
  type: 'workspace-invalidated'
  rootId: string
  sourceToken?: string
}

export interface WorkspaceConfigurationInvalidationEvent {
  type: 'workspace-configuration-invalidated'
  rootId: string
  sourceToken?: string
}

export interface BranchWorkspaceOperationUpdatedEvent {
  type: 'branch-workspace-operation-updated'
  rootId: string
  branchWorkspaceId: string
  operation: BranchWorkspaceActiveOperation | null
}

export type ServerInvalidationEvent =
  | BranchWorkspaceOperationUpdatedEvent
  | RepoQueryInvalidationEvent
  | SettingsInvalidationEvent
  | WorkspaceConfigurationInvalidationEvent
  | WorkspaceInvalidationEvent

export function isSettingsInvalidationScope(value: unknown): value is SettingsInvalidationScope {
  return value === 'settings-snapshot' || value === 'external-apps' || value === 'i18n' || value === 'theme'
}

export function isSettingsInvalidationEvent(value: unknown): value is SettingsInvalidationEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<SettingsInvalidationEvent>
  return (
    event.type === 'settings-invalidated' &&
    Array.isArray(event.scopes) &&
    event.scopes.every((scope) => isSettingsInvalidationScope(scope))
  )
}

export function isWorkspaceInvalidationEvent(value: unknown): value is WorkspaceInvalidationEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<WorkspaceInvalidationEvent>
  return (
    event.type === 'workspace-invalidated' &&
    typeof event.rootId === 'string' &&
    event.rootId.length > 0 &&
    event.rootId.trim() === event.rootId &&
    !event.rootId.includes('\0') &&
    !/[\x00-\x1f\x7f]/.test(event.rootId) &&
    (event.sourceToken === undefined || typeof event.sourceToken === 'string')
  )
}

export function isWorkspaceConfigurationInvalidationEvent(
  value: unknown,
): value is WorkspaceConfigurationInvalidationEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<WorkspaceConfigurationInvalidationEvent>
  return (
    event.type === 'workspace-configuration-invalidated' &&
    isSafeEventText(event.rootId) &&
    (event.sourceToken === undefined || isInvalidationSourceToken(event.sourceToken))
  )
}

export function isBranchWorkspaceOperationUpdatedEvent(value: unknown): value is BranchWorkspaceOperationUpdatedEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<BranchWorkspaceOperationUpdatedEvent>
  return (
    event.type === 'branch-workspace-operation-updated' &&
    isSafeEventText(event.rootId) &&
    isSafeEventText(event.branchWorkspaceId) &&
    (event.operation === null || isBranchWorkspaceActiveOperation(event.operation))
  )
}

export function isServerInvalidationEvent(value: unknown): value is ServerInvalidationEvent {
  return (
    isBranchWorkspaceOperationUpdatedEvent(value) ||
    isRepoQueryInvalidationEvent(value) ||
    isSettingsInvalidationEvent(value) ||
    isWorkspaceConfigurationInvalidationEvent(value) ||
    isWorkspaceInvalidationEvent(value)
  )
}

export function settingsInvalidationScopesForPrefsPatch(patch: Record<string, unknown>): SettingsInvalidationScope[] {
  const scopes = new Set<SettingsInvalidationScope>(['settings-snapshot'])
  if ('lang' in patch) scopes.add('i18n')
  if ('theme' in patch || 'colorTheme' in patch) scopes.add('theme')
  if ('terminalApp' in patch || 'editorApp' in patch) scopes.add('external-apps')
  return [...scopes]
}

function isBranchWorkspaceActiveOperation(value: unknown): value is BranchWorkspaceActiveOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const operation = value as Partial<BranchWorkspaceActiveOperation>
  return (
    isBranchWorkspaceGitActionKind(operation.kind) &&
    isProgressCount(operation.currentStep) &&
    isProgressCount(operation.completedCount) &&
    isProgressCount(operation.totalCount) &&
    operation.currentStep <= operation.totalCount &&
    operation.completedCount <= operation.totalCount &&
    typeof operation.cancellable === 'boolean' &&
    (operation.repositoryName === undefined || isSafeEventText(operation.repositoryName)) &&
    (operation.step === undefined || isBranchWorkspaceGitActionStep(operation.step))
  )
}

function isBranchWorkspaceGitActionKind(value: unknown): boolean {
  return (
    value === 'batch-commit' ||
    value === 'batch-discard' ||
    value === 'batch-merge-in' ||
    value === 'batch-merge-out' ||
    value === 'batch-set-upstream' ||
    value === 'pull' ||
    value === 'push'
  )
}

function isBranchWorkspaceGitActionStep(value: unknown): boolean {
  return (
    value === 'commit' ||
    value === 'discard' ||
    value === 'prepare' ||
    value === 'pull' ||
    value === 'fetch' ||
    value === 'merge' ||
    value === 'push' ||
    value === 'cleanup' ||
    value === 'upstream'
  )
}

function isProgressCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isSafeEventText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
}

function isInvalidationSourceToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}
