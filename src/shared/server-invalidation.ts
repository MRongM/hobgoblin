import { isRepoQueryInvalidationEvent, type RepoQueryInvalidationEvent } from '#/shared/repo-query-invalidation.ts'

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

export type ServerInvalidationEvent =
  | RepoQueryInvalidationEvent
  | SettingsInvalidationEvent
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

export function isServerInvalidationEvent(value: unknown): value is ServerInvalidationEvent {
  return (
    isRepoQueryInvalidationEvent(value) || isSettingsInvalidationEvent(value) || isWorkspaceInvalidationEvent(value)
  )
}

export function settingsInvalidationScopesForPrefsPatch(patch: Record<string, unknown>): SettingsInvalidationScope[] {
  const scopes = new Set<SettingsInvalidationScope>(['settings-snapshot'])
  if ('lang' in patch) scopes.add('i18n')
  if ('theme' in patch || 'colorTheme' in patch) scopes.add('theme')
  if ('terminalApp' in patch || 'editorApp' in patch) scopes.add('external-apps')
  return [...scopes]
}
