import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_IPC_PATH_LENGTH,
  isValidAbsolutePath,
  toSafeRepoLocator,
  toSafeSessionRepoEntry,
} from '#/shared/input-validation.ts'
import { safeRelativePath } from '#/shared/path-semantics.ts'
import { isWorkspaceRepositoryName } from '#/shared/workspace.ts'
import { serverDataFile } from '#/server/common/data-dir.ts'
import { hashWebAccessPassword, isWebAccessPasswordHash } from '#/server/modules/web-access-auth.ts'
import type {
  EditorPref,
  FontFamilyPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalPref,
  ThemePref,
  WorkspaceActiveContext,
  WebAccessSettingsSnapshot,
} from '#/shared/rpc.ts'
import {
  DEFAULT_DETAIL_COLLAPSED,
  effectiveDetailCollapsed,
  normalizeDetailPaneSizes,
  normalizeFileTreePaneSizes,
  normalizeWorkspaceLayout,
} from '#/shared/workspace-layout.ts'
import { isRemoteRepoId, parseRemoteRepoId, repoSessionEntryId, type RepoSessionEntry } from '#/shared/remote-repo.ts'
import {
  clearRepoSettingsEntryColorTheme,
  isWorktreeBootstrapConfigHash,
  repoSettingsEntryHasPersistedFields,
  setRepoSettingsEntryColorTheme,
  type RepoSettingsEntry,
  type WorktreeBootstrapTrust,
} from '#/shared/repo-settings.ts'
import { normalizeGlobalShortcut } from '#/shared/accelerator.ts'
import { isColorTheme, normalizeColorTheme, type ColorTheme } from '#/shared/color-theme.ts'
import {
  DEFAULT_EDITOR_APP,
  DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
  DEFAULT_FETCH_INTERVAL_SEC,
  DEFAULT_FONT_FAMILY,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  DEFAULT_LANG_PREF,
  DEFAULT_PROJECT_LIST_EXPANDED,
  DEFAULT_SESSION_DETAIL_FOCUS_MODE,
  DEFAULT_TERMINAL_APP,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED,
  DEFAULT_TERMINAL_THEME_SYNC_ENABLED,
  DEFAULT_THEME_PREF,
  MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MAX_FILE_TREE_FONT_SIZE,
  MAX_FILE_TREE_TOPBAR_FONT_SIZE,
  MAX_GIT_NETWORK_TIMEOUT_SEC,
  MAX_RECENT_REPOS,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_FILE_TREE_TOPBAR_FONT_SIZE,
  MIN_GIT_NETWORK_TIMEOUT_SEC,
  MIN_SERVER_PORT,
  MIN_TERMINAL_FONT_SIZE,
  MAX_SERVER_PORT,
  DEFAULT_SERVER_PORT,
  defaultSessionState,
  defaultSettingsPrefs,
} from '#/shared/settings-defaults.ts'
import { DEFAULT_TOPBAR_HEIGHT_PX, DEFAULT_TOOLBAR_HEIGHT_PX, normalizeChromeHeightPx } from '#/shared/window-chrome.ts'

type FetchIntervalListener = (sec: number) => void
interface ServerSettingsData {
  lang: LangPref
  theme: ThemePref
  colorTheme: ColorTheme
  fontFamily: FontFamilyPref
  fetchIntervalSec: number
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
  terminalNotificationsEnabled: boolean
  shortcutsDisabled: boolean
  globalShortcutDisabled: boolean
  swapCloseShortcuts: boolean
  terminalThemeSyncEnabled: boolean
  temporaryFilesDirectory: string
  globalShortcut: string
  terminalApp: TerminalPref
  editorApp: EditorPref
  topbarHeightPx: number
  toolbarHeightPx: number
  fileTreeFontSize: number
  fileTreeTopbarFontSize: number
  fileTreeClipboardMaxBytesMb: number
  terminalFontSize: number
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
  serverPort: number
  webAccessEnabled: boolean
  webAccessUsername: string
  webAccessPasswordHash: string
  session: SessionState
  recentRepos: RepoSessionEntry[]
  repoSettings: RepoSettingsEntry[]
}

export type ServerSettingsPrefsPatch = Partial<SettingsPrefs>

let cachedFetchIntervalSec = DEFAULT_FETCH_INTERVAL_SEC
let settingsPromise: Promise<ServerSettingsData> | null = null
const listeners = new Set<FetchIntervalListener>()
const MAX_TERMINAL_CUSTOM_BUTTONS = 20
const MAX_WEB_ACCESS_USERNAME_LENGTH = 128
const MIN_WEB_ACCESS_PASSWORD_LENGTH = 8
const MAX_WEB_ACCESS_PASSWORD_LENGTH = 1024

export type WebAccessSettingsErrorCode =
  | 'username-required'
  | 'username-invalid'
  | 'password-required'
  | 'password-too-short'
  | 'password-too-long'

export class WebAccessSettingsError extends Error {
  readonly code: WebAccessSettingsErrorCode

  constructor(code: WebAccessSettingsErrorCode) {
    super(code)
    this.name = 'WebAccessSettingsError'
    this.code = code
  }
}

function normalizeFetchInterval(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(3600, Math.round(value)))
    : DEFAULT_FETCH_INTERVAL_SEC
}

function normalizeThemePref(value: unknown): ThemePref {
  return value === 'auto' || value === 'light' || value === 'dark' ? value : DEFAULT_THEME_PREF
}

function normalizeLangPref(value: unknown): LangPref {
  return value === 'auto' || value === 'en' || value === 'zh' || value === 'ko' || value === 'ja'
    ? value
    : DEFAULT_LANG_PREF
}

function normalizeFontFamilyPref(value: unknown): FontFamilyPref {
  return value === 'mono' || value === 'maple' || value === 'system' ? value : DEFAULT_FONT_FAMILY
}

function normalizeTerminalPref(value: unknown): TerminalPref {
  return value === 'auto' || value === 'ghostty' || value === 'terminal' ? value : DEFAULT_TERMINAL_APP
}

function normalizeEditorPref(value: unknown): EditorPref {
  return value === 'auto' || value === 'vscode' || value === 'cursor' || value === 'windsurf'
    ? value
    : DEFAULT_EDITOR_APP
}

function normalizeFontSize(value: unknown, options: { min: number; max: number; fallback: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return options.fallback
  return Math.max(options.min, Math.min(options.max, Math.round(value)))
}

function normalizeFileTreeFontSize(value: unknown): number {
  return normalizeFontSize(value, {
    min: MIN_FILE_TREE_FONT_SIZE,
    max: MAX_FILE_TREE_FONT_SIZE,
    fallback: DEFAULT_FILE_TREE_FONT_SIZE,
  })
}

function normalizeFileTreeTopbarFontSize(value: unknown): number {
  return normalizeFontSize(value, {
    min: MIN_FILE_TREE_TOPBAR_FONT_SIZE,
    max: MAX_FILE_TREE_TOPBAR_FONT_SIZE,
    fallback: DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
  })
}

function normalizeFileTreeClipboardMaxBytesMb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_FILE_TREE_CLIPBOARD_MAX_BYTES_MB
  return Math.max(
    MIN_FILE_TREE_CLIPBOARD_MAX_BYTES_MB,
    Math.min(MAX_FILE_TREE_CLIPBOARD_MAX_BYTES_MB, Math.round(value)),
  )
}

function normalizeTerminalFontSize(value: unknown): number {
  return normalizeFontSize(value, {
    min: MIN_TERMINAL_FONT_SIZE,
    max: MAX_TERMINAL_FONT_SIZE,
    fallback: DEFAULT_TERMINAL_FONT_SIZE,
  })
}

function normalizeTopbarHeightPx(value: unknown): number {
  return normalizeChromeHeightPx(value, DEFAULT_TOPBAR_HEIGHT_PX)
}

function normalizeToolbarHeightPx(value: unknown): number {
  return normalizeChromeHeightPx(value, DEFAULT_TOOLBAR_HEIGHT_PX)
}

function normalizeTerminalNotificationsEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED
}

function normalizeTemporaryFilesDirectory(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_IPC_PATH_LENGTH || trimmed.includes('\0')) return ''
  if (isValidAbsolutePath(trimmed)) return trimmed
  return safeRelativePath(trimmed) ?? ''
}

function normalizeTerminalThemeSyncEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_TERMINAL_THEME_SYNC_ENABLED
}

function normalizeRemoteTerminalTmuxEnabled(value: unknown): boolean {
  return value === true
}

function normalizeTerminalCustomButtonsVisible(value: unknown): boolean {
  return value !== false
}

function normalizeTerminalCustomButtonSize(value: unknown): TerminalCustomButtonSize {
  return value === 'small' || value === 'medium' || value === 'large' ? value : DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE
}

function normalizeTerminalCustomButtonAction(value: unknown): TerminalCustomButtonAction {
  return value === 'input' ? 'input' : 'execute'
}

function normalizeTerminalCustomButtons(value: unknown): TerminalCustomButton[] {
  if (!Array.isArray(value)) return []
  const normalized: TerminalCustomButton[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const button = item as Partial<TerminalCustomButton>
    if (typeof button.label !== 'string' || typeof button.value !== 'string') continue
    const label = button.label.trim()
    if (!label || button.value.trim().length === 0) continue
    normalized.push({ label, value: button.value, action: normalizeTerminalCustomButtonAction(button.action) })
    if (normalized.length >= MAX_TERMINAL_CUSTOM_BUTTONS) break
  }
  return normalized
}

function normalizeLanEnabled(value: unknown): boolean {
  return value === true
}

function normalizeServerPort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SERVER_PORT
  const port = Math.round(value)
  return port >= MIN_SERVER_PORT && port <= MAX_SERVER_PORT ? port : DEFAULT_SERVER_PORT
}

function normalizeWebAccessUsername(value: unknown): string {
  if (typeof value !== 'string') return ''
  const username = value.trim()
  if (!username || username.length > MAX_WEB_ACCESS_USERNAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(username)) {
    return ''
  }
  return username
}

function webAccessSettingsFromData(data: ServerSettingsData): WebAccessSettingsSnapshot {
  const passwordConfigured = Boolean(data.webAccessUsername && isWebAccessPasswordHash(data.webAccessPasswordHash))
  return {
    enabled: data.webAccessEnabled && passwordConfigured,
    username: passwordConfigured ? data.webAccessUsername : '',
    passwordConfigured,
  }
}

function normalizeGitNetworkProxyEnabled(value: unknown): boolean {
  return value === true
}

function normalizeGitNetworkProxyUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'socks5:' ? trimmed : ''
  } catch {
    return ''
  }
}

function normalizeGitNetworkTimeoutSec(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GIT_NETWORK_TIMEOUT_SEC
  return Math.max(MIN_GIT_NETWORK_TIMEOUT_SEC, Math.min(MAX_GIT_NETWORK_TIMEOUT_SEC, Math.round(value)))
}

function settingsPrefsFromData(data: ServerSettingsData): SettingsPrefs {
  return {
    lang: data.lang,
    theme: data.theme,
    colorTheme: data.colorTheme,
    fontFamily: data.fontFamily,
    fetchIntervalSec: data.fetchIntervalSec,
    gitNetworkProxyEnabled: data.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: data.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: data.gitNetworkTimeoutSec,
    terminalNotificationsEnabled: data.terminalNotificationsEnabled,
    shortcutsDisabled: data.shortcutsDisabled,
    globalShortcutDisabled: data.globalShortcutDisabled,
    swapCloseShortcuts: data.swapCloseShortcuts,
    terminalThemeSyncEnabled: data.terminalThemeSyncEnabled,
    temporaryFilesDirectory: data.temporaryFilesDirectory,
    globalShortcut: data.globalShortcut,
    terminalApp: data.terminalApp,
    editorApp: data.editorApp,
    topbarHeightPx: data.topbarHeightPx,
    toolbarHeightPx: data.toolbarHeightPx,
    fileTreeFontSize: data.fileTreeFontSize,
    fileTreeTopbarFontSize: data.fileTreeTopbarFontSize,
    fileTreeClipboardMaxBytesMb: data.fileTreeClipboardMaxBytesMb,
    terminalFontSize: data.terminalFontSize,
    remoteTerminalTmuxEnabled: data.remoteTerminalTmuxEnabled,
    terminalCustomButtonsVisible: data.terminalCustomButtonsVisible,
    terminalCustomButtonSize: data.terminalCustomButtonSize,
    terminalCustomButtons: data.terminalCustomButtons,
    lanEnabled: data.lanEnabled,
    serverPort: data.serverPort,
  }
}

function dedupeRepoEntries(entries: RepoSessionEntry[]): RepoSessionEntry[] {
  const seen = new Set<string>()
  const normalized: RepoSessionEntry[] = []
  for (const entry of entries) {
    const id = repoSessionEntryId(entry)
    if (seen.has(id)) continue
    seen.add(id)
    normalized.push(entry)
  }
  return normalized
}

function defaultSession(): SessionState {
  return defaultSessionState()
}

function normalizeSelectedTerminalByWorktree(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const normalized: Record<string, string> = {}
  for (const [worktreeKey, key] of Object.entries(value)) {
    if (typeof worktreeKey !== 'string' || typeof key !== 'string') continue
    const parts = worktreeKey.split('\0')
    if (parts.length !== 2 || !parts[0] || !parts[1]) continue
    if (!key.startsWith(`${worktreeKey}\0`)) continue
    normalized[worktreeKey] = key
  }
  return normalized
}

function normalizeWorkspaceActiveRepoByRoot(
  value: unknown,
  openRepos: RepoSessionEntry[],
): Record<string, string | null> {
  if (!value || typeof value !== 'object') return {}
  const openRootIds = new Set(openRepos.map(repoSessionEntryId))
  const normalized: Record<string, string | null> = {}
  for (const [rawRoot, rawSelection] of Object.entries(value)) {
    const root = toSafeRepoLocator(rawRoot)
    if (!root || !openRootIds.has(root)) continue
    if (rawSelection === null) {
      normalized[root] = null
      continue
    }
    const selection = toSafeRepoLocator(rawSelection)
    if (!selection || !isImmediateWorkspaceRepository(root, selection)) continue
    normalized[root] = selection
  }
  return normalized
}

function normalizeWorkspaceActiveContextByRoot(
  taggedValue: unknown,
  legacyValue: unknown,
  openRepos: RepoSessionEntry[],
): Record<string, WorkspaceActiveContext> {
  const openRootIds = new Set(openRepos.map(repoSessionEntryId))
  const normalized: Record<string, WorkspaceActiveContext> = {}
  const legacy = normalizeWorkspaceActiveRepoByRoot(legacyValue, openRepos)
  for (const [rootId, repositoryId] of Object.entries(legacy)) {
    normalized[rootId] =
      repositoryId === null || repositoryId === rootId ? { kind: 'overview' } : { kind: 'repository', repositoryId }
  }
  if (!taggedValue || typeof taggedValue !== 'object') return normalized
  for (const [rawRootId, rawContext] of Object.entries(taggedValue)) {
    const rootId = toSafeRepoLocator(rawRootId)
    if (!rootId || !openRootIds.has(rootId) || !rawContext || typeof rawContext !== 'object') continue
    const context = rawContext as Partial<WorkspaceActiveContext>
    if (context.kind === 'overview') {
      normalized[rootId] = { kind: 'overview' }
      continue
    }
    if (context.kind === 'repository') {
      const repositoryId = toSafeRepoLocator(context.repositoryId)
      if (repositoryId && isImmediateWorkspaceRepository(rootId, repositoryId)) {
        normalized[rootId] = { kind: 'repository', repositoryId }
      }
      continue
    }
    if (context.kind === 'branch-workspace' && isValidBranchWorkspaceContextId(context.branchWorkspaceId)) {
      normalized[rootId] = {
        kind: 'branch-workspace',
        branchWorkspaceId: context.branchWorkspaceId,
        ...(isWorkspaceRepositoryName(context.memberRepositoryName)
          ? { memberRepositoryName: context.memberRepositoryName }
          : {}),
      }
    }
  }
  return normalized
}

function normalizeWorkspaceRepositoryListExpandedByRoot(
  value: unknown,
  openRepos: RepoSessionEntry[],
): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {}
  const openRootIds = new Set(openRepos.map(repoSessionEntryId))
  const normalized: Record<string, boolean> = {}
  for (const [rawRootId, expanded] of Object.entries(value)) {
    const rootId = toSafeRepoLocator(rawRootId)
    if (rootId && openRootIds.has(rootId) && typeof expanded === 'boolean') normalized[rootId] = expanded
  }
  return normalized
}

function isImmediateWorkspaceRepository(rootId: string, repositoryId: string): boolean {
  if (isRemoteRepoId(rootId) || isRemoteRepoId(repositoryId)) {
    const root = parseRemoteRepoId(rootId)
    const repository = parseRemoteRepoId(repositoryId)
    return (
      !!root &&
      !!repository &&
      root.alias === repository.alias &&
      path.posix.dirname(repository.remotePath) === root.remotePath
    )
  }
  return path.dirname(path.resolve(repositoryId)) === path.resolve(rootId)
}

function isValidBranchWorkspaceContextId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value)
}

function normalizeSession(value: unknown): SessionState {
  if (!value || typeof value !== 'object') return defaultSession()
  const partial = value as Partial<SessionState> & { activeTerminalByGroup?: unknown }
  const openRepos = Array.isArray(partial.openRepos)
    ? dedupeRepoEntries(
        partial.openRepos.map(toSafeSessionRepoEntry).filter((entry): entry is RepoSessionEntry => entry !== null),
      )
    : []
  const activeRepo = toSafeRepoLocator(partial.activeRepo)
  const workspaceActiveContextByRoot = normalizeWorkspaceActiveContextByRoot(
    partial.workspaceActiveContextByRoot,
    partial.workspaceActiveRepoByRoot,
    openRepos,
  )
  const workspaceLayout = normalizeWorkspaceLayout(partial.workspaceLayout)
  const detailCollapsed =
    typeof partial.detailCollapsed === 'boolean' ? partial.detailCollapsed : DEFAULT_DETAIL_COLLAPSED
  return {
    openRepos,
    activeRepo:
      activeRepo &&
      (openRepos.some((entry) => repoSessionEntryId(entry) === activeRepo) ||
        Object.values(workspaceActiveContextByRoot).some(
          (context) => context.kind === 'repository' && context.repositoryId === activeRepo,
        ))
        ? activeRepo
        : null,
    workspaceActiveContextByRoot,
    workspaceRepositoryListExpandedByRoot: normalizeWorkspaceRepositoryListExpandedByRoot(
      partial.workspaceRepositoryListExpandedByRoot,
      openRepos,
    ),
    projectListExpanded:
      typeof partial.projectListExpanded === 'boolean' ? partial.projectListExpanded : DEFAULT_PROJECT_LIST_EXPANDED,
    detailCollapsed: effectiveDetailCollapsed(workspaceLayout, detailCollapsed),
    detailFocusMode: DEFAULT_SESSION_DETAIL_FOCUS_MODE,
    workspaceLayout,
    detailPaneSizes: normalizeDetailPaneSizes(partial.detailPaneSizes),
    fileTreePaneSizes: normalizeFileTreePaneSizes(partial.fileTreePaneSizes),
    selectedTerminalByWorktree: normalizeSelectedTerminalByWorktree(
      partial.selectedTerminalByWorktree ?? partial.activeTerminalByGroup,
    ),
  }
}

function normalizeRecentRepos(value: unknown): RepoSessionEntry[] {
  if (!Array.isArray(value)) return []
  return dedupeRepoEntries(
    value.map(toSafeSessionRepoEntry).filter((entry): entry is RepoSessionEntry => entry !== null),
  ).slice(0, MAX_RECENT_REPOS)
}

function normalizeRepoSettings(value: unknown): RepoSettingsEntry[] {
  if (!Array.isArray(value)) return []
  const entries = new Map<string, RepoSettingsEntry>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<RepoSettingsEntry>
    if (typeof raw.repoId !== 'string' || raw.repoId.length === 0) continue
    const next: RepoSettingsEntry = { repoId: raw.repoId }
    if (isColorTheme(raw.colorTheme)) next.colorTheme = raw.colorTheme
    const trust = normalizeWorktreeBootstrapTrust(raw.worktreeBootstrapTrust)
    if (trust) next.worktreeBootstrapTrust = trust
    if (repoSettingsEntryHasPersistedFields(next)) entries.set(next.repoId, next)
  }
  return Array.from(entries.values())
}

function normalizeWorktreeBootstrapTrust(value: unknown): WorktreeBootstrapTrust | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<WorktreeBootstrapTrust>
  if (!isWorktreeBootstrapConfigHash(raw.configHash)) return undefined
  if (typeof raw.trustedAt !== 'string' || raw.trustedAt.length === 0) return undefined
  return { configHash: raw.configHash, trustedAt: raw.trustedAt }
}

async function readServerSettingsFile(): Promise<ServerSettingsData | null> {
  try {
    const raw = await readFile(serverDataFile('server-settings.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ServerSettingsData>
    return {
      lang: normalizeLangPref(parsed.lang),
      theme: normalizeThemePref(parsed.theme),
      colorTheme: normalizeColorTheme(parsed.colorTheme),
      fontFamily: normalizeFontFamilyPref(parsed.fontFamily),
      fetchIntervalSec: normalizeFetchInterval(parsed.fetchIntervalSec),
      gitNetworkProxyEnabled: normalizeGitNetworkProxyEnabled(parsed.gitNetworkProxyEnabled),
      gitNetworkProxyUrl: normalizeGitNetworkProxyUrl(parsed.gitNetworkProxyUrl),
      gitNetworkTimeoutSec: normalizeGitNetworkTimeoutSec(parsed.gitNetworkTimeoutSec),
      terminalNotificationsEnabled: normalizeTerminalNotificationsEnabled(parsed.terminalNotificationsEnabled),
      shortcutsDisabled: parsed.shortcutsDisabled === true,
      globalShortcutDisabled: parsed.globalShortcutDisabled === true,
      swapCloseShortcuts: parsed.swapCloseShortcuts === true,
      terminalThemeSyncEnabled: normalizeTerminalThemeSyncEnabled(parsed.terminalThemeSyncEnabled),
      temporaryFilesDirectory: normalizeTemporaryFilesDirectory(parsed.temporaryFilesDirectory),
      globalShortcut: normalizeGlobalShortcut(parsed.globalShortcut),
      terminalApp: normalizeTerminalPref(parsed.terminalApp),
      editorApp: normalizeEditorPref(parsed.editorApp),
      topbarHeightPx: normalizeTopbarHeightPx(parsed.topbarHeightPx),
      toolbarHeightPx: normalizeToolbarHeightPx(parsed.toolbarHeightPx),
      fileTreeFontSize: normalizeFileTreeFontSize(parsed.fileTreeFontSize),
      fileTreeTopbarFontSize: normalizeFileTreeTopbarFontSize(parsed.fileTreeTopbarFontSize),
      fileTreeClipboardMaxBytesMb: normalizeFileTreeClipboardMaxBytesMb(parsed.fileTreeClipboardMaxBytesMb),
      terminalFontSize: normalizeTerminalFontSize(parsed.terminalFontSize),
      remoteTerminalTmuxEnabled: normalizeRemoteTerminalTmuxEnabled(parsed.remoteTerminalTmuxEnabled),
      terminalCustomButtonsVisible: normalizeTerminalCustomButtonsVisible(parsed.terminalCustomButtonsVisible),
      terminalCustomButtonSize: normalizeTerminalCustomButtonSize(parsed.terminalCustomButtonSize),
      terminalCustomButtons: normalizeTerminalCustomButtons(parsed.terminalCustomButtons),
      lanEnabled: normalizeLanEnabled(parsed.lanEnabled),
      serverPort: normalizeServerPort(parsed.serverPort),
      webAccessEnabled:
        parsed.webAccessEnabled === true &&
        Boolean(normalizeWebAccessUsername(parsed.webAccessUsername)) &&
        isWebAccessPasswordHash(parsed.webAccessPasswordHash),
      webAccessUsername: isWebAccessPasswordHash(parsed.webAccessPasswordHash)
        ? normalizeWebAccessUsername(parsed.webAccessUsername)
        : '',
      webAccessPasswordHash:
        normalizeWebAccessUsername(parsed.webAccessUsername) && isWebAccessPasswordHash(parsed.webAccessPasswordHash)
          ? parsed.webAccessPasswordHash
          : '',
      session: normalizeSession(parsed.session),
      recentRepos: normalizeRecentRepos(parsed.recentRepos),
      repoSettings: normalizeRepoSettings(parsed.repoSettings),
    }
  } catch {
    return null
  }
}

async function writeServerSettingsFile(data: ServerSettingsData): Promise<void> {
  const file = serverDataFile('server-settings.json')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

async function loadServerSettings(): Promise<ServerSettingsData> {
  settingsPromise ??= (async () => {
    const persisted = await readServerSettingsFile()
    const data = persisted ?? {
      ...defaultSettingsPrefs(),
      webAccessEnabled: false,
      webAccessUsername: '',
      webAccessPasswordHash: '',
      session: defaultSession(),
      recentRepos: [],
      repoSettings: [],
    }
    await writeServerSettingsFile(data)
    cachedFetchIntervalSec = data.fetchIntervalSec
    return data
  })()
  return await settingsPromise
}

export async function getServerFetchIntervalSec(): Promise<number> {
  await loadServerSettings()
  return cachedFetchIntervalSec
}

export async function getServerSettingsPrefs(): Promise<SettingsPrefs> {
  return settingsPrefsFromData(await loadServerSettings())
}

export async function getServerWebAccessSettings(): Promise<WebAccessSettingsSnapshot> {
  return webAccessSettingsFromData(await loadServerSettings())
}

export async function getServerWebAccessCredentials(): Promise<{
  enabled: boolean
  username: string
  passwordHash: string
}> {
  const data = await loadServerSettings()
  const snapshot = webAccessSettingsFromData(data)
  return {
    enabled: snapshot.enabled,
    username: snapshot.username,
    passwordHash: snapshot.passwordConfigured ? data.webAccessPasswordHash : '',
  }
}

export async function updateServerWebAccessSettings(input: {
  enabled: boolean
  username: string
  password?: string
}): Promise<WebAccessSettingsSnapshot> {
  const data = await loadServerSettings()
  const current = webAccessSettingsFromData(data)
  const rawUsername = typeof input.username === 'string' ? input.username.trim() : ''
  const normalizedUsername = normalizeWebAccessUsername(rawUsername)
  if (rawUsername && !normalizedUsername) throw new WebAccessSettingsError('username-invalid')

  const username = normalizedUsername || (!input.enabled && current.passwordConfigured ? current.username : '')
  if (input.enabled && !username) throw new WebAccessSettingsError('username-required')

  const password = typeof input.password === 'string' ? input.password : ''
  if (password.length > MAX_WEB_ACCESS_PASSWORD_LENGTH) throw new WebAccessSettingsError('password-too-long')
  if (password && password.length < MIN_WEB_ACCESS_PASSWORD_LENGTH) {
    throw new WebAccessSettingsError('password-too-short')
  }
  const mayKeepPassword = current.passwordConfigured && username === current.username
  if (!password && input.enabled && !mayKeepPassword) throw new WebAccessSettingsError('password-required')
  if (!password && normalizedUsername && normalizedUsername !== current.username) {
    throw new WebAccessSettingsError('password-required')
  }

  const passwordHash = password
    ? await hashWebAccessPassword(password)
    : mayKeepPassword
      ? data.webAccessPasswordHash
      : ''
  data.webAccessEnabled = input.enabled === true
  data.webAccessUsername = username
  data.webAccessPasswordHash = passwordHash
  await writeServerSettingsFile(data)
  return webAccessSettingsFromData(data)
}

export function subscribeServerFetchInterval(listener: FetchIntervalListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function setServerFetchIntervalSec(sec: number): Promise<number> {
  const data = await loadServerSettings()
  const next = normalizeFetchInterval(sec)
  if (data.fetchIntervalSec !== next) {
    data.fetchIntervalSec = next
    await writeServerSettingsFile(data)
  }
  if (cachedFetchIntervalSec !== next) {
    cachedFetchIntervalSec = next
    for (const listener of listeners) listener(next)
  }
  return next
}

export async function updateServerSettingsPrefs(patch: ServerSettingsPrefsPatch): Promise<SettingsPrefs> {
  const data = await loadServerSettings()
  const nextLang = patch.lang === undefined ? data.lang : normalizeLangPref(patch.lang)
  const nextTheme = patch.theme === undefined ? data.theme : normalizeThemePref(patch.theme)
  const nextColorTheme = patch.colorTheme === undefined ? data.colorTheme : normalizeColorTheme(patch.colorTheme)
  const nextFontFamily = patch.fontFamily === undefined ? data.fontFamily : normalizeFontFamilyPref(patch.fontFamily)
  const nextFetchIntervalSec =
    patch.fetchIntervalSec === undefined ? data.fetchIntervalSec : normalizeFetchInterval(patch.fetchIntervalSec)
  const nextGitNetworkProxyEnabled =
    patch.gitNetworkProxyEnabled === undefined
      ? data.gitNetworkProxyEnabled
      : normalizeGitNetworkProxyEnabled(patch.gitNetworkProxyEnabled)
  const nextGitNetworkProxyUrl =
    patch.gitNetworkProxyUrl === undefined
      ? data.gitNetworkProxyUrl
      : normalizeGitNetworkProxyUrl(patch.gitNetworkProxyUrl)
  const nextGitNetworkTimeoutSec =
    patch.gitNetworkTimeoutSec === undefined
      ? data.gitNetworkTimeoutSec
      : normalizeGitNetworkTimeoutSec(patch.gitNetworkTimeoutSec)
  const nextTerminalNotificationsEnabled =
    patch.terminalNotificationsEnabled === undefined
      ? data.terminalNotificationsEnabled
      : normalizeTerminalNotificationsEnabled(patch.terminalNotificationsEnabled)
  const nextShortcutsDisabled =
    patch.shortcutsDisabled === undefined ? data.shortcutsDisabled : patch.shortcutsDisabled === true
  const nextGlobalShortcutDisabled =
    patch.globalShortcutDisabled === undefined ? data.globalShortcutDisabled : patch.globalShortcutDisabled === true
  const nextSwapCloseShortcuts =
    patch.swapCloseShortcuts === undefined ? data.swapCloseShortcuts : patch.swapCloseShortcuts === true
  const nextTerminalThemeSyncEnabled =
    patch.terminalThemeSyncEnabled === undefined
      ? data.terminalThemeSyncEnabled
      : normalizeTerminalThemeSyncEnabled(patch.terminalThemeSyncEnabled)
  const nextTemporaryFilesDirectory =
    patch.temporaryFilesDirectory === undefined
      ? data.temporaryFilesDirectory
      : normalizeTemporaryFilesDirectory(patch.temporaryFilesDirectory)
  const nextGlobalShortcut =
    patch.globalShortcut === undefined ? data.globalShortcut : normalizeGlobalShortcut(patch.globalShortcut)
  const nextTerminalApp = patch.terminalApp === undefined ? data.terminalApp : normalizeTerminalPref(patch.terminalApp)
  const nextEditorApp = patch.editorApp === undefined ? data.editorApp : normalizeEditorPref(patch.editorApp)
  const nextTopbarHeightPx =
    patch.topbarHeightPx === undefined ? data.topbarHeightPx : normalizeTopbarHeightPx(patch.topbarHeightPx)
  const nextToolbarHeightPx =
    patch.toolbarHeightPx === undefined ? data.toolbarHeightPx : normalizeToolbarHeightPx(patch.toolbarHeightPx)
  const nextFileTreeFontSize =
    patch.fileTreeFontSize === undefined ? data.fileTreeFontSize : normalizeFileTreeFontSize(patch.fileTreeFontSize)
  const nextFileTreeTopbarFontSize =
    patch.fileTreeTopbarFontSize === undefined
      ? data.fileTreeTopbarFontSize
      : normalizeFileTreeTopbarFontSize(patch.fileTreeTopbarFontSize)
  const nextFileTreeClipboardMaxBytesMb =
    patch.fileTreeClipboardMaxBytesMb === undefined
      ? data.fileTreeClipboardMaxBytesMb
      : normalizeFileTreeClipboardMaxBytesMb(patch.fileTreeClipboardMaxBytesMb)
  const nextTerminalFontSize =
    patch.terminalFontSize === undefined ? data.terminalFontSize : normalizeTerminalFontSize(patch.terminalFontSize)
  const nextRemoteTerminalTmuxEnabled =
    patch.remoteTerminalTmuxEnabled === undefined
      ? data.remoteTerminalTmuxEnabled
      : normalizeRemoteTerminalTmuxEnabled(patch.remoteTerminalTmuxEnabled)
  const nextTerminalCustomButtonsVisible =
    patch.terminalCustomButtonsVisible === undefined
      ? data.terminalCustomButtonsVisible
      : normalizeTerminalCustomButtonsVisible(patch.terminalCustomButtonsVisible)
  const nextTerminalCustomButtonSize =
    patch.terminalCustomButtonSize === undefined
      ? data.terminalCustomButtonSize
      : normalizeTerminalCustomButtonSize(patch.terminalCustomButtonSize)
  const nextTerminalCustomButtons =
    patch.terminalCustomButtons === undefined
      ? data.terminalCustomButtons
      : normalizeTerminalCustomButtons(patch.terminalCustomButtons)
  const nextLanEnabled = patch.lanEnabled === undefined ? data.lanEnabled : normalizeLanEnabled(patch.lanEnabled)
  const nextServerPort = patch.serverPort === undefined ? data.serverPort : normalizeServerPort(patch.serverPort)
  const changed =
    data.lang !== nextLang ||
    data.theme !== nextTheme ||
    data.colorTheme !== nextColorTheme ||
    data.fontFamily !== nextFontFamily ||
    data.fetchIntervalSec !== nextFetchIntervalSec ||
    data.gitNetworkProxyEnabled !== nextGitNetworkProxyEnabled ||
    data.gitNetworkProxyUrl !== nextGitNetworkProxyUrl ||
    data.gitNetworkTimeoutSec !== nextGitNetworkTimeoutSec ||
    data.terminalNotificationsEnabled !== nextTerminalNotificationsEnabled ||
    data.shortcutsDisabled !== nextShortcutsDisabled ||
    data.globalShortcutDisabled !== nextGlobalShortcutDisabled ||
    data.swapCloseShortcuts !== nextSwapCloseShortcuts ||
    data.terminalThemeSyncEnabled !== nextTerminalThemeSyncEnabled ||
    data.temporaryFilesDirectory !== nextTemporaryFilesDirectory ||
    data.globalShortcut !== nextGlobalShortcut ||
    data.terminalApp !== nextTerminalApp ||
    data.editorApp !== nextEditorApp ||
    data.topbarHeightPx !== nextTopbarHeightPx ||
    data.toolbarHeightPx !== nextToolbarHeightPx ||
    data.fileTreeFontSize !== nextFileTreeFontSize ||
    data.fileTreeTopbarFontSize !== nextFileTreeTopbarFontSize ||
    data.fileTreeClipboardMaxBytesMb !== nextFileTreeClipboardMaxBytesMb ||
    data.terminalFontSize !== nextTerminalFontSize ||
    data.remoteTerminalTmuxEnabled !== nextRemoteTerminalTmuxEnabled ||
    data.terminalCustomButtonsVisible !== nextTerminalCustomButtonsVisible ||
    data.terminalCustomButtonSize !== nextTerminalCustomButtonSize ||
    JSON.stringify(data.terminalCustomButtons) !== JSON.stringify(nextTerminalCustomButtons) ||
    data.lanEnabled !== nextLanEnabled ||
    data.serverPort !== nextServerPort
  data.lang = nextLang
  data.theme = nextTheme
  data.colorTheme = nextColorTheme
  data.fontFamily = nextFontFamily
  data.fetchIntervalSec = nextFetchIntervalSec
  data.gitNetworkProxyEnabled = nextGitNetworkProxyEnabled
  data.gitNetworkProxyUrl = nextGitNetworkProxyUrl
  data.gitNetworkTimeoutSec = nextGitNetworkTimeoutSec
  data.terminalNotificationsEnabled = nextTerminalNotificationsEnabled
  data.shortcutsDisabled = nextShortcutsDisabled
  data.globalShortcutDisabled = nextGlobalShortcutDisabled
  data.swapCloseShortcuts = nextSwapCloseShortcuts
  data.terminalThemeSyncEnabled = nextTerminalThemeSyncEnabled
  data.temporaryFilesDirectory = nextTemporaryFilesDirectory
  data.globalShortcut = nextGlobalShortcut
  data.terminalApp = nextTerminalApp
  data.editorApp = nextEditorApp
  data.topbarHeightPx = nextTopbarHeightPx
  data.toolbarHeightPx = nextToolbarHeightPx
  data.fileTreeFontSize = nextFileTreeFontSize
  data.fileTreeTopbarFontSize = nextFileTreeTopbarFontSize
  data.fileTreeClipboardMaxBytesMb = nextFileTreeClipboardMaxBytesMb
  data.terminalFontSize = nextTerminalFontSize
  data.remoteTerminalTmuxEnabled = nextRemoteTerminalTmuxEnabled
  data.terminalCustomButtonsVisible = nextTerminalCustomButtonsVisible
  data.terminalCustomButtonSize = nextTerminalCustomButtonSize
  data.terminalCustomButtons = nextTerminalCustomButtons
  data.lanEnabled = nextLanEnabled
  data.serverPort = nextServerPort
  if (changed) await writeServerSettingsFile(data)
  if (cachedFetchIntervalSec !== nextFetchIntervalSec) {
    cachedFetchIntervalSec = nextFetchIntervalSec
    for (const listener of listeners) listener(nextFetchIntervalSec)
  }
  return settingsPrefsFromData(data)
}

export async function getServerSessionState(): Promise<SessionState> {
  return (await loadServerSettings()).session
}

export async function setServerSessionState(session: SessionState): Promise<SessionState> {
  const data = await loadServerSettings()
  const next = normalizeSession(session)
  data.session = next
  await writeServerSettingsFile(data)
  return next
}

export async function getServerRecentRepos(): Promise<RepoSessionEntry[]> {
  return [...(await loadServerSettings()).recentRepos]
}

export async function getServerRepoSettings(): Promise<RepoSettingsEntry[]> {
  return cloneRepoSettings((await loadServerSettings()).repoSettings)
}

export async function setServerRepoColorTheme(input: {
  repoId: string
  colorTheme?: ColorTheme | null
}): Promise<RepoSettingsEntry[]> {
  const data = await loadServerSettings()
  if (!input.repoId) return cloneRepoSettings(data.repoSettings)
  if (input.colorTheme === null || input.colorTheme === undefined) {
    data.repoSettings = clearRepoSettingsEntryColorTheme(data.repoSettings, input.repoId)
    await writeServerSettingsFile(data)
    return cloneRepoSettings(data.repoSettings)
  }
  if (!isColorTheme(input.colorTheme)) return cloneRepoSettings(data.repoSettings)
  data.repoSettings = setRepoSettingsEntryColorTheme(data.repoSettings, input.repoId, input.colorTheme)
  await writeServerSettingsFile(data)
  return cloneRepoSettings(data.repoSettings)
}

export async function trustServerRepoWorktreeBootstrapConfig(input: {
  repoId: string
  configHash: string
}): Promise<RepoSettingsEntry[]> {
  const data = await loadServerSettings()
  if (!input.repoId || !isWorktreeBootstrapConfigHash(input.configHash)) return cloneRepoSettings(data.repoSettings)
  const worktreeBootstrapTrust: WorktreeBootstrapTrust = {
    configHash: input.configHash,
    trustedAt: new Date().toISOString(),
  }
  const existing = data.repoSettings.find((entry) => entry.repoId === input.repoId)
  data.repoSettings = upsertRepoSettingsEntry(data.repoSettings, {
    repoId: input.repoId,
    ...(existing?.colorTheme ? { colorTheme: existing.colorTheme } : {}),
    worktreeBootstrapTrust,
  })
  await writeServerSettingsFile(data)
  return cloneRepoSettings(data.repoSettings)
}

export async function untrustServerRepoWorktreeBootstrapConfig(input: {
  repoId: string
  configHash: string
}): Promise<boolean> {
  const data = await loadServerSettings()
  if (!input.repoId || !isWorktreeBootstrapConfigHash(input.configHash)) return false
  const existing = data.repoSettings.find((entry) => entry.repoId === input.repoId)
  if (existing?.worktreeBootstrapTrust?.configHash !== input.configHash) return false
  const next: RepoSettingsEntry = {
    repoId: input.repoId,
    ...(existing.colorTheme ? { colorTheme: existing.colorTheme } : {}),
  }
  data.repoSettings = repoSettingsEntryHasPersistedFields(next)
    ? [next, ...data.repoSettings.filter((entry) => entry.repoId !== input.repoId)]
    : data.repoSettings.filter((entry) => entry.repoId !== input.repoId)
  await writeServerSettingsFile(data)
  return true
}

function cloneRepoSettings(repoSettings: readonly RepoSettingsEntry[]): RepoSettingsEntry[] {
  return repoSettings.map((entry) => ({
    repoId: entry.repoId,
    ...(entry.colorTheme ? { colorTheme: entry.colorTheme } : {}),
    ...(entry.worktreeBootstrapTrust
      ? {
          worktreeBootstrapTrust: {
            configHash: entry.worktreeBootstrapTrust.configHash,
            trustedAt: entry.worktreeBootstrapTrust.trustedAt,
          },
        }
      : {}),
  }))
}

function upsertRepoSettingsEntry(entries: readonly RepoSettingsEntry[], next: RepoSettingsEntry): RepoSettingsEntry[] {
  return [next, ...entries.filter((entry) => entry.repoId !== next.repoId)]
}

export async function addServerRecentRepo(repo: RepoSessionEntry): Promise<RepoSessionEntry[]> {
  const data = await loadServerSettings()
  const safeRepo = toSafeSessionRepoEntry(repo)
  if (!safeRepo) return [...data.recentRepos]
  const safeId = repoSessionEntryId(safeRepo)
  data.recentRepos = [safeRepo, ...data.recentRepos.filter((entry) => repoSessionEntryId(entry) !== safeId)].slice(
    0,
    MAX_RECENT_REPOS,
  )
  await writeServerSettingsFile(data)
  return [...data.recentRepos]
}

export async function clearServerRecentRepos(): Promise<void> {
  const data = await loadServerSettings()
  if (data.recentRepos.length === 0) return
  data.recentRepos = []
  await writeServerSettingsFile(data)
}

export function resetServerSettingsSourceForTests(): void {
  settingsPromise = null
  listeners.clear()
  cachedFetchIntervalSec = DEFAULT_FETCH_INTERVAL_SEC
}
