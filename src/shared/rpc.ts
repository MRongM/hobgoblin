import * as v from 'valibot'
import type { BranchSnapshotInfo, ExecResult, RepoRemoteInfo } from '#/shared/git-types.ts'
import type { WorkspaceDetailPaneSizes, WorkspaceLayout } from '#/shared/workspace-layout.ts'
import type { ColorTheme } from '#/shared/color-theme.ts'
import type {
  EditorAppAvailability,
  EditorPref,
  Lang,
  LangPref,
  ResolvedEditorApp,
  ResolvedTerminalApp,
  ResolvedTheme,
  SettingsPrefs,
  TerminalAppAvailability,
  TerminalPref,
  ThemePref,
} from '#/shared/settings.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { RepoQueryInvalidationEvent } from '#/shared/repo-query-invalidation.ts'
import type { RepoSettingsEntry } from '#/shared/repo-settings.ts'
import type { TelegramNotificationSettingsSnapshot } from '#/shared/telegram-notifications.ts'
import { NativeShellProjectionSchema, type NativeShellProjection } from '#/shared/native-shell-projection.ts'

export type { WorkspaceLayout } from '#/shared/workspace-layout.ts'
export type { SettingsPage } from '#/shared/settings-pages.ts'
export type {
  EditorAppAvailability,
  EditorPref,
  FontFamilyPref,
  Lang,
  LangPref,
  ResolvedEditorApp,
  ResolvedTerminalApp,
  ResolvedTheme,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalAppAvailability,
  TerminalPref,
  ThemePref,
  WindowsInternalTerminalShellPref,
} from '#/shared/settings.ts'
export type {
  NativeRecentReposProjection,
  NativeSettingsProjectionPatch,
  NativeSettingsProjectionState,
  NativeShellProjection,
} from '#/shared/native-shell-projection.ts'
export type { RepoSettingsEntry } from '#/shared/repo-settings.ts'
export type {
  TelegramBellNotificationContext,
  TelegramNotificationErrorCode,
  TelegramNotificationResult,
  TelegramNotificationSettingsSnapshot,
  TelegramNotificationSettingsUpdateInput,
  TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'

export interface LanInfo {
  host: string
  port: number
  lanUrls: string[]
}

export type NetworkOpKind = 'user' | 'background'

export interface ThemeState {
  pref: ThemePref
  resolved: ResolvedTheme
  colorTheme: ColorTheme
}

export type WorkspaceActiveContext =
  | { kind: 'overview' }
  | { kind: 'repository'; repositoryId: string }
  | {
      kind: 'branch-workspace'
      branchWorkspaceId: string
      memberRepositoryName?: string
    }

export interface SessionState {
  /** Repo entries that were open, in tab order. */
  openRepos: RepoSessionEntry[]
  /** The visible repository id — null when no project is open. */
  activeRepo: string | null
  /** The active top-level project id. Missing values are migrated from activeRepo. */
  activeProject?: string | null
  /** Last tagged selection for each open multi-repository workspace root. */
  workspaceActiveContextByRoot?: Record<string, WorkspaceActiveContext>
  /** @deprecated Read-only migration input from sessions written before tagged workspace contexts. */
  workspaceActiveRepoByRoot?: Record<string, string | null>
  /** Missing roots default to visible. The legacy field name is retained for session compatibility. */
  workspaceRepositoryListExpandedByRoot?: Record<string, boolean>
  /** Desktop repository-list heights by open multi-repository workspace root. */
  workspaceRepositoryListHeightByRoot?: Record<string, number>
  projectListExpanded: boolean
  detailCollapsed: boolean
  detailFocusMode: boolean
  workspaceLayout: WorkspaceLayout
  detailPaneSizes: WorkspaceDetailPaneSizes
  fileTreePaneSizes?: WorkspaceDetailPaneSizes
  selectedTerminalByWorktree?: Record<string, string>
}

export interface RuntimeSettingsSnapshot extends SettingsPrefs {
  globalShortcutRegistered: boolean
}

export interface RuntimeRecentReposState {
  recentRepos: RepoSessionEntry[]
}

export interface WebAccessSettingsSnapshot {
  enabled: boolean
  username: string
  passwordConfigured: boolean
}

export interface WebAccessSettingsUpdateInput {
  enabled: boolean
  username: string
  password?: string
}

export interface SettingsSnapshot extends RuntimeSettingsSnapshot, RuntimeRecentReposState {
  session: SessionState
  repoSettings: RepoSettingsEntry[]
  webAccess: WebAccessSettingsSnapshot
  telegramNotifications: TelegramNotificationSettingsSnapshot
}

export interface TerminalAppState {
  pref: TerminalPref
  resolved: ResolvedTerminalApp | null
  available: boolean
  appAvailability: TerminalAppAvailability
  detectedAt: number
}

export interface EditorAppState {
  pref: EditorPref
  resolved: ResolvedEditorApp | null
  available: boolean
  appAvailability: EditorAppAvailability
  detectedAt: number
}

export interface ExternalAppsSnapshot {
  terminal: TerminalAppState
  editor: EditorAppState
}

export interface I18nSnapshot {
  lang: Lang
  pref: LangPref
  dict: Record<string, string>
}

export interface SettingsPrefsUpdateResponse {
  ok: true
  settings: SettingsPrefs
  i18n?: I18nSnapshot
  externalApps?: ExternalAppsSnapshot
}

export interface RepoSnapshot {
  branches: BranchSnapshotInfo[]
  current: string
  remote?: RepoRemoteInfo
}

export interface ProbeResult {
  ok: boolean
  root?: string
  name?: string
  message?: string
  /** undefined or true = git repo; false = readable directory that is not a git repo */
  isGitRepo?: boolean
}

export interface CloneRepoResult extends ExecResult {
  path?: string
}

export type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
export { isRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'

export interface RpcRequest {
  path: string
  input?: unknown
  requestId?: string
}

export type RpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { message: string; code?: string; name?: string } }

export type I18nChangedEvent =
  | { type: 'i18n-changed'; snapshot: I18nSnapshot; payload?: never }
  | { type: 'i18n-changed'; payload: I18nSnapshot; snapshot?: never }

export type RpcEvent =
  | { type: 'theme-changed'; state: ThemeState }
  | { type: 'fetch-interval-changed'; sec: number }
  | { type: 'terminal-notifications-changed'; enabled: boolean }
  | { type: 'shortcuts-disabled-changed'; disabled: boolean }
  | ({ type: 'terminal-app-changed' } & TerminalAppState)
  | ({ type: 'editor-app-changed' } & EditorAppState)
  | { type: 'settings-write-error'; message: string }
  | I18nChangedEvent
  | RepoQueryInvalidationEvent

export interface NativeRpcHandlers {
  settings: {
    applyShellProjection: (input: NativeShellProjection) => Promise<void>
  }
}

export type NativeBridgeHandlers = NativeRpcHandlers

export type NativeRpcPath = {
  [NS in keyof NativeBridgeHandlers]: `${Extract<NS, string>}.${Extract<keyof NativeBridgeHandlers[NS], string>}`
}[keyof NativeBridgeHandlers]

export type RpcErrorCode = 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR'

export class RpcError extends Error {
  readonly code: string

  constructor(options: { code: RpcErrorCode | string; message: string }) {
    super(options.message)
    this.name = 'RpcError'
    this.code = options.code
  }
}

type ValibotSchema = Parameters<typeof v.safeParse>[0]

type NativeRpcProcedureSchemas = {
  [NS in keyof NativeRpcHandlers]: { [Proc in keyof NativeRpcHandlers[NS]]: ValibotSchema }
}

export const RPC_PROCEDURE_SCHEMAS: NativeRpcProcedureSchemas = {
  settings: {
    applyShellProjection: NativeShellProjectionSchema,
  },
}

function parseRpcInput<T>(schema: ValibotSchema, input: unknown): T {
  const parsed = v.safeParse(schema, input)
  if (!parsed.success) throw new RpcError({ code: 'BAD_REQUEST', message: 'Invalid RPC input' })
  return parsed.output as T
}

function createValidatedProcedure<TInput, TOutput>(
  schema: ValibotSchema,
  handler: (input: TInput) => Promise<TOutput> | TOutput,
): (input: unknown) => Promise<TOutput> {
  return async (input: unknown) => await handler(parseRpcInput<TInput>(schema, input))
}

function createValidatedNamespace<THandlers extends Record<string, (...args: never[]) => unknown>>(
  handlers: THandlers,
  schemas: { [K in keyof THandlers]: ValibotSchema },
): { [K in keyof THandlers]: (input: unknown) => Promise<Awaited<ReturnType<THandlers[K]>>> } {
  const procedures = {} as { [K in keyof THandlers]: (input: unknown) => Promise<Awaited<ReturnType<THandlers[K]>>> }
  for (const key of Object.keys(schemas) as Array<keyof THandlers>) {
    const schema = schemas[key]
    const handler = handlers[key]
    procedures[key] = createValidatedProcedure(
      schema,
      async (input: unknown) => await (handler as unknown as (input: unknown) => unknown)(input),
    ) as {
      [K in keyof THandlers]: (input: unknown) => Promise<Awaited<ReturnType<THandlers[K]>>>
    }[typeof key]
  }
  return procedures
}

export interface AppRouter {
  createCaller: () => {
    settings: {
      [K in keyof NativeRpcHandlers['settings']]: (
        input: unknown,
      ) => Promise<Awaited<ReturnType<NativeRpcHandlers['settings'][K]>>>
    }
  }
}

export function createAppRouter(handlers: NativeRpcHandlers): AppRouter {
  return {
    createCaller: () => ({
      settings: createValidatedNamespace(handlers.settings, RPC_PROCEDURE_SCHEMAS.settings),
    }),
  }
}
