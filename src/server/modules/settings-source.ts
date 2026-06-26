import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isValidAbsolutePath, toSafeRepoLocator, toSafeSessionRepoEntry } from '#/shared/input-validation.ts'
import { serverDataFile } from '#/server/common/data-dir.ts'
import type {
  EditorPref,
  LangPref,
  SessionState,
  SettingsPrefs,
  TerminalCustomButton,
  TerminalCustomButtonAction,
  TerminalCustomButtonSize,
  TerminalPref,
  ThemePref,
} from '#/shared/rpc.ts'
import {
  DEFAULT_DETAIL_COLLAPSED,
  effectiveDetailCollapsed,
  normalizeDetailPaneSizes,
  normalizeWorkspaceLayout,
} from '#/shared/workspace-layout.ts'
import { repoSessionEntryId, type RepoSessionEntry } from '#/shared/remote-repo.ts'
import { normalizeGlobalShortcut } from '#/shared/accelerator.ts'
import { normalizeColorTheme, type ColorTheme } from '#/shared/color-theme.ts'
import {
  DEFAULT_EDITOR_APP,
  DEFAULT_FILE_TREE_FONT_SIZE,
  DEFAULT_FILE_TREE_TOPBAR_FONT_SIZE,
  DEFAULT_FETCH_INTERVAL_SEC,
  DEFAULT_GIT_NETWORK_TIMEOUT_SEC,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_GLOBAL_SHORTCUT_DISABLED,
  DEFAULT_LANG_PREF,
  DEFAULT_SESSION_DETAIL_FOCUS_MODE,
  DEFAULT_SHORTCUTS_DISABLED,
  DEFAULT_SWAP_CLOSE_SHORTCUTS,
  DEFAULT_TERMINAL_APP,
  DEFAULT_TERMINAL_CUSTOM_BUTTON_SIZE,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_NOTIFICATIONS_ENABLED,
  DEFAULT_TERMINAL_THEME_SYNC_ENABLED,
  DEFAULT_THEME_PREF,
  DEFAULT_TOGGLE_DETAIL_ON_ACTION_BAR_BLANK_CLICK,
  MAX_FILE_TREE_FONT_SIZE,
  MAX_FILE_TREE_TOPBAR_FONT_SIZE,
  MAX_GIT_NETWORK_TIMEOUT_SEC,
  MAX_RECENT_REPOS,
  MAX_TERMINAL_FONT_SIZE,
  MIN_FILE_TREE_FONT_SIZE,
  MIN_FILE_TREE_TOPBAR_FONT_SIZE,
  MIN_GIT_NETWORK_TIMEOUT_SEC,
  MIN_TERMINAL_FONT_SIZE,
  defaultSessionState,
  defaultSettingsPrefs,
} from '#/shared/settings-defaults.ts'

type FetchIntervalListener = (sec: number) => void
interface ServerSettingsData {
  lang: LangPref
  theme: ThemePref
  colorTheme: ColorTheme
  fetchIntervalSec: number
  gitNetworkProxyEnabled: boolean
  gitNetworkProxyUrl: string
  gitNetworkTimeoutSec: number
  terminalNotificationsEnabled: boolean
  shortcutsDisabled: boolean
  globalShortcutDisabled: boolean
  swapCloseShortcuts: boolean
  toggleDetailOnActionBarBlankClick: boolean
  terminalThemeSyncEnabled: boolean
  temporaryFilesDirectory: string
  globalShortcut: string
  terminalApp: TerminalPref
  editorApp: EditorPref
  fileTreeFontSize: number
  fileTreeTopbarFontSize: number
  terminalFontSize: number
  terminalExternalInputEnabled: boolean
  remoteTerminalTmuxEnabled: boolean
  terminalCustomButtonsVisible: boolean
  terminalCustomButtonSize: TerminalCustomButtonSize
  terminalCustomButtons: TerminalCustomButton[]
  lanEnabled: boolean
  session: SessionState
  recentRepos: RepoSessionEntry[]
}

export type ServerSettingsPrefsPatch = Partial<SettingsPrefs>

let cachedFetchIntervalSec = DEFAULT_FETCH_INTERVAL_SEC
let settingsPromise: Promise<ServerSettingsData> | null = null
const listeners = new Set<FetchIntervalListener>()
const MAX_TERMINAL_CUSTOM_BUTTONS = 20

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

function normalizeTerminalFontSize(value: unknown): number {
  return normalizeFontSize(value, {
    min: MIN_TERMINAL_FONT_SIZE,
    max: MAX_TERMINAL_FONT_SIZE,
    fallback: DEFAULT_TERMINAL_FONT_SIZE,
  })
}

function normalizeTerminalNotificationsEnabled(value: unknown): boolean {
  return value === true
}

function normalizeTemporaryFilesDirectory(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return isValidAbsolutePath(trimmed) ? trimmed : ''
}

function normalizeTerminalThemeSyncEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_TERMINAL_THEME_SYNC_ENABLED
}

function normalizeTerminalExternalInputEnabled(value: unknown): boolean {
  return value === true
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
    fetchIntervalSec: data.fetchIntervalSec,
    gitNetworkProxyEnabled: data.gitNetworkProxyEnabled,
    gitNetworkProxyUrl: data.gitNetworkProxyUrl,
    gitNetworkTimeoutSec: data.gitNetworkTimeoutSec,
    terminalNotificationsEnabled: data.terminalNotificationsEnabled,
    shortcutsDisabled: data.shortcutsDisabled,
    globalShortcutDisabled: data.globalShortcutDisabled,
    swapCloseShortcuts: data.swapCloseShortcuts,
    toggleDetailOnActionBarBlankClick: data.toggleDetailOnActionBarBlankClick,
    terminalThemeSyncEnabled: data.terminalThemeSyncEnabled,
    temporaryFilesDirectory: data.temporaryFilesDirectory,
    globalShortcut: data.globalShortcut,
    terminalApp: data.terminalApp,
    editorApp: data.editorApp,
    fileTreeFontSize: data.fileTreeFontSize,
    fileTreeTopbarFontSize: data.fileTreeTopbarFontSize,
    terminalFontSize: data.terminalFontSize,
    terminalExternalInputEnabled: data.terminalExternalInputEnabled,
    remoteTerminalTmuxEnabled: data.remoteTerminalTmuxEnabled,
    terminalCustomButtonsVisible: data.terminalCustomButtonsVisible,
    terminalCustomButtonSize: data.terminalCustomButtonSize,
    terminalCustomButtons: data.terminalCustomButtons,
    lanEnabled: data.lanEnabled,
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

function normalizeSession(value: unknown): SessionState {
  if (!value || typeof value !== 'object') return defaultSession()
  const partial = value as Partial<SessionState> & { activeTerminalByGroup?: unknown }
  const openRepos = Array.isArray(partial.openRepos)
    ? dedupeRepoEntries(
        partial.openRepos.map(toSafeSessionRepoEntry).filter((entry): entry is RepoSessionEntry => entry !== null),
      )
    : []
  const activeRepo = toSafeRepoLocator(partial.activeRepo)
  const workspaceLayout = normalizeWorkspaceLayout(partial.workspaceLayout)
  const detailCollapsed =
    typeof partial.detailCollapsed === 'boolean' ? partial.detailCollapsed : DEFAULT_DETAIL_COLLAPSED
  const detailFocusMode =
    workspaceLayout === 'top-bottom' && partial.detailFocusMode === true ? true : DEFAULT_SESSION_DETAIL_FOCUS_MODE
  return {
    openRepos,
    activeRepo: activeRepo && openRepos.some((entry) => repoSessionEntryId(entry) === activeRepo) ? activeRepo : null,
    detailCollapsed: effectiveDetailCollapsed(workspaceLayout, detailCollapsed),
    detailFocusMode,
    workspaceLayout,
    detailPaneSizes: normalizeDetailPaneSizes(partial.detailPaneSizes),
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

async function readServerSettingsFile(): Promise<ServerSettingsData | null> {
  try {
    const raw = await readFile(serverDataFile('server-settings.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ServerSettingsData>
    return {
      lang: normalizeLangPref(parsed.lang),
      theme: normalizeThemePref(parsed.theme),
      colorTheme: normalizeColorTheme(parsed.colorTheme),
      fetchIntervalSec: normalizeFetchInterval(parsed.fetchIntervalSec),
      gitNetworkProxyEnabled: normalizeGitNetworkProxyEnabled(parsed.gitNetworkProxyEnabled),
      gitNetworkProxyUrl: normalizeGitNetworkProxyUrl(parsed.gitNetworkProxyUrl),
      gitNetworkTimeoutSec: normalizeGitNetworkTimeoutSec(parsed.gitNetworkTimeoutSec),
      terminalNotificationsEnabled: normalizeTerminalNotificationsEnabled(parsed.terminalNotificationsEnabled),
      shortcutsDisabled: parsed.shortcutsDisabled === true,
      globalShortcutDisabled: parsed.globalShortcutDisabled === true,
      swapCloseShortcuts: parsed.swapCloseShortcuts === true,
      toggleDetailOnActionBarBlankClick: parsed.toggleDetailOnActionBarBlankClick === true,
      terminalThemeSyncEnabled: normalizeTerminalThemeSyncEnabled(parsed.terminalThemeSyncEnabled),
      temporaryFilesDirectory: normalizeTemporaryFilesDirectory(parsed.temporaryFilesDirectory),
      globalShortcut: normalizeGlobalShortcut(parsed.globalShortcut),
      terminalApp: normalizeTerminalPref(parsed.terminalApp),
      editorApp: normalizeEditorPref(parsed.editorApp),
      fileTreeFontSize: normalizeFileTreeFontSize(parsed.fileTreeFontSize),
      fileTreeTopbarFontSize: normalizeFileTreeTopbarFontSize(parsed.fileTreeTopbarFontSize),
      terminalFontSize: normalizeTerminalFontSize(parsed.terminalFontSize),
      terminalExternalInputEnabled: normalizeTerminalExternalInputEnabled(parsed.terminalExternalInputEnabled),
      remoteTerminalTmuxEnabled: normalizeRemoteTerminalTmuxEnabled(parsed.remoteTerminalTmuxEnabled),
      terminalCustomButtonsVisible: normalizeTerminalCustomButtonsVisible(parsed.terminalCustomButtonsVisible),
      terminalCustomButtonSize: normalizeTerminalCustomButtonSize(parsed.terminalCustomButtonSize),
      terminalCustomButtons: normalizeTerminalCustomButtons(parsed.terminalCustomButtons),
      lanEnabled: normalizeLanEnabled(parsed.lanEnabled),
      session: normalizeSession(parsed.session),
      recentRepos: normalizeRecentRepos(parsed.recentRepos),
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
    const data = persisted ?? { ...defaultSettingsPrefs(), session: defaultSession(), recentRepos: [] }
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
  const nextToggleDetailOnActionBarBlankClick =
    patch.toggleDetailOnActionBarBlankClick === undefined
      ? data.toggleDetailOnActionBarBlankClick
      : patch.toggleDetailOnActionBarBlankClick === true
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
  const nextFileTreeFontSize =
    patch.fileTreeFontSize === undefined ? data.fileTreeFontSize : normalizeFileTreeFontSize(patch.fileTreeFontSize)
  const nextFileTreeTopbarFontSize =
    patch.fileTreeTopbarFontSize === undefined
      ? data.fileTreeTopbarFontSize
      : normalizeFileTreeTopbarFontSize(patch.fileTreeTopbarFontSize)
  const nextTerminalFontSize =
    patch.terminalFontSize === undefined ? data.terminalFontSize : normalizeTerminalFontSize(patch.terminalFontSize)
  const nextTerminalExternalInputEnabled =
    patch.terminalExternalInputEnabled === undefined
      ? data.terminalExternalInputEnabled
      : normalizeTerminalExternalInputEnabled(patch.terminalExternalInputEnabled)
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
  const changed =
    data.lang !== nextLang ||
    data.theme !== nextTheme ||
    data.colorTheme !== nextColorTheme ||
    data.fetchIntervalSec !== nextFetchIntervalSec ||
    data.gitNetworkProxyEnabled !== nextGitNetworkProxyEnabled ||
    data.gitNetworkProxyUrl !== nextGitNetworkProxyUrl ||
    data.gitNetworkTimeoutSec !== nextGitNetworkTimeoutSec ||
    data.terminalNotificationsEnabled !== nextTerminalNotificationsEnabled ||
    data.shortcutsDisabled !== nextShortcutsDisabled ||
    data.globalShortcutDisabled !== nextGlobalShortcutDisabled ||
    data.swapCloseShortcuts !== nextSwapCloseShortcuts ||
    data.toggleDetailOnActionBarBlankClick !== nextToggleDetailOnActionBarBlankClick ||
    data.terminalThemeSyncEnabled !== nextTerminalThemeSyncEnabled ||
    data.temporaryFilesDirectory !== nextTemporaryFilesDirectory ||
    data.globalShortcut !== nextGlobalShortcut ||
    data.terminalApp !== nextTerminalApp ||
    data.editorApp !== nextEditorApp ||
    data.fileTreeFontSize !== nextFileTreeFontSize ||
    data.fileTreeTopbarFontSize !== nextFileTreeTopbarFontSize ||
    data.terminalFontSize !== nextTerminalFontSize ||
    data.terminalExternalInputEnabled !== nextTerminalExternalInputEnabled ||
    data.remoteTerminalTmuxEnabled !== nextRemoteTerminalTmuxEnabled ||
    data.terminalCustomButtonsVisible !== nextTerminalCustomButtonsVisible ||
    data.terminalCustomButtonSize !== nextTerminalCustomButtonSize ||
    JSON.stringify(data.terminalCustomButtons) !== JSON.stringify(nextTerminalCustomButtons) ||
    data.lanEnabled !== nextLanEnabled
  data.lang = nextLang
  data.theme = nextTheme
  data.colorTheme = nextColorTheme
  data.fetchIntervalSec = nextFetchIntervalSec
  data.gitNetworkProxyEnabled = nextGitNetworkProxyEnabled
  data.gitNetworkProxyUrl = nextGitNetworkProxyUrl
  data.gitNetworkTimeoutSec = nextGitNetworkTimeoutSec
  data.terminalNotificationsEnabled = nextTerminalNotificationsEnabled
  data.shortcutsDisabled = nextShortcutsDisabled
  data.globalShortcutDisabled = nextGlobalShortcutDisabled
  data.swapCloseShortcuts = nextSwapCloseShortcuts
  data.toggleDetailOnActionBarBlankClick = nextToggleDetailOnActionBarBlankClick
  data.terminalThemeSyncEnabled = nextTerminalThemeSyncEnabled
  data.temporaryFilesDirectory = nextTemporaryFilesDirectory
  data.globalShortcut = nextGlobalShortcut
  data.terminalApp = nextTerminalApp
  data.editorApp = nextEditorApp
  data.fileTreeFontSize = nextFileTreeFontSize
  data.fileTreeTopbarFontSize = nextFileTreeTopbarFontSize
  data.terminalFontSize = nextTerminalFontSize
  data.terminalExternalInputEnabled = nextTerminalExternalInputEnabled
  data.remoteTerminalTmuxEnabled = nextRemoteTerminalTmuxEnabled
  data.terminalCustomButtonsVisible = nextTerminalCustomButtonsVisible
  data.terminalCustomButtonSize = nextTerminalCustomButtonSize
  data.terminalCustomButtons = nextTerminalCustomButtons
  data.lanEnabled = nextLanEnabled
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
