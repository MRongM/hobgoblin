import PQueue from 'p-queue'
import { serverLogger } from '#/server/logger.ts'
import { getServerSettingsPrefs, getServerTelegramNotificationConfig } from '#/server/modules/settings-source.ts'
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  telegramProxyUrlFromPrefs,
} from '#/server/modules/telegram-notification-source.ts'
import type { renderTelegramTerminalScreenImage } from '#/server/modules/telegram-terminal-screen-image.ts'
import { DICTS } from '#/shared/i18n/dictionaries.ts'
import { resolvePreferredLang } from '#/shared/i18n/resolve-lang.ts'
import type { Lang, SettingsPrefs } from '#/shared/rpc.ts'
import {
  TELEGRAM_CONTEXT_TEXT_MAX_LENGTH,
  TELEGRAM_PHOTO_CAPTION_MAX_LENGTH,
  TELEGRAM_TERMINAL_SCREEN_MAX_COLUMNS,
  TELEGRAM_TERMINAL_SCREEN_MAX_ROWS,
  type TelegramBellNotificationContext,
  type TelegramNotificationResult,
  type TelegramOutputCompletionNotificationContext,
} from '#/shared/telegram-notifications.ts'
import type { TerminalScreenSnapshot, TerminalScreenSnapshotInput } from '#/shared/terminal.ts'

const TELEGRAM_BELL_DEBOUNCE_MS = 5_000
const TELEGRAM_TERMINAL_KEY_MAX_LENGTH = 1_024
const telegramNotificationLogger = serverLogger.child({ module: 'telegram-notifications' })
const lastBellAtByTerminal = new Map<string, number>()
const completionAtByCycle = new Map<string, number>()
const terminalScreenMediaQueue = new PQueue({ concurrency: 1 })
const TELEGRAM_COMPLETION_CACHE_MAX_ENTRIES = 1_000
const TELEGRAM_COMPLETION_CACHE_TTL_MS = 24 * 60 * 60 * 1_000

type TelegramConfig = {
  enabled: boolean
  botToken: string
  chatId: string
  proxyEnabled: boolean
  bellEnabled: boolean
  outputCompletionEnabled: boolean
  outputCompletionMinimumActivitySeconds: number
  includeTerminalOutput: boolean
}
type SendMessage = typeof sendTelegramMessage
type SendPhoto = typeof sendTelegramPhoto
type RenderTerminalScreenImage = typeof renderTelegramTerminalScreenImage

const defaultRenderTerminalScreenImage: RenderTerminalScreenImage = async (snapshot) => {
  const imageModule = await import('#/server/modules/telegram-terminal-screen-image.ts')
  return await imageModule.renderTelegramTerminalScreenImage(snapshot)
}

export interface TelegramNotificationWriteOptions {
  acceptLanguage?: string | null
  getSettingsPrefs?: () => Promise<SettingsPrefs>
  getTelegramConfig?: () => Promise<TelegramConfig>
  sendMessage?: SendMessage
  sendPhoto?: SendPhoto
  readTerminalScreenSnapshot?: (input: TerminalScreenSnapshotInput) => Promise<TerminalScreenSnapshot | null>
  renderTerminalScreenImage?: RenderTerminalScreenImage
  now?: () => number
  warn?: (code: string) => void
}

function line(label: string, value: string, lang: Lang): string {
  return lang === 'zh' || lang === 'ja' ? `${label}：${value}` : `${label}: ${value}`
}

export function formatTelegramBellMessage(context: TelegramBellNotificationContext, lang: Lang = 'zh'): string {
  return formatTelegramTerminalMessage(context, lang, 'telegram.notification.message.title')
}

export function formatTelegramOutputCompletionMessage(
  context: TelegramBellNotificationContext,
  lang: Lang = 'zh',
): string {
  return formatTelegramTerminalMessage(context, lang, 'telegram.notification.message.output-completion-title')
}

export function formatTelegramPhotoCaption(
  context: TelegramBellNotificationContext,
  lang: Lang = 'zh',
): string {
  return boundedPhotoCaption(formatTelegramOutputCompletionMessage(context, lang))
}

export function formatTelegramBellPhotoCaption(
  context: TelegramBellNotificationContext,
  lang: Lang = 'zh',
): string {
  return boundedPhotoCaption(formatTelegramBellMessage(context, lang))
}

function boundedPhotoCaption(caption: string): string {
  return Array.from(caption).slice(0, TELEGRAM_PHOTO_CAPTION_MAX_LENGTH).join('')
}

function formatTelegramTerminalMessage(
  context: TelegramBellNotificationContext,
  lang: Lang,
  titleKey: 'telegram.notification.message.title' | 'telegram.notification.message.output-completion-title',
): string {
  const dict = DICTS[lang]
  const contextKind = dict[`telegram.notification.message.context.${context.contextKind}`]
  const lines = [
    dict[titleKey],
    line(dict['telegram.notification.message.project'], context.project, lang),
    line(dict['telegram.notification.message.context'], `${contextKind} ${context.context}`, lang),
    line(dict['telegram.notification.message.directory'], context.directory, lang),
  ]
  if (context.branch) lines.push(line(dict['telegram.notification.message.branch'], context.branch, lang))
  lines.push(line(dict['telegram.notification.message.terminal'], `#${context.terminalIndex}`, lang))
  if (context.terminalTitle) {
    lines.push(line(dict['telegram.notification.message.terminal-title'], context.terminalTitle, lang))
  }
  return lines.join('\n')
}

function validatedField(value: unknown, required = true): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if ((!trimmed && required) || trimmed.length > TELEGRAM_CONTEXT_TEXT_MAX_LENGTH) return undefined
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) return undefined
  return trimmed || undefined
}

function validatedTerminalKey(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > TELEGRAM_TERMINAL_KEY_MAX_LENGTH) return undefined
  return /[\u0001-\u001f\u007f]/u.test(value) ? undefined : value
}

function validatedContext(value: TelegramBellNotificationContext): TelegramBellNotificationContext | null {
  if (!value || typeof value !== 'object') return null
  const terminalKey = validatedTerminalKey(value.terminalKey)
  const project = validatedField(value.project)
  const context = validatedField(value.context)
  const directory = validatedField(value.directory)
  const branch = value.branch === undefined ? undefined : validatedField(value.branch, false)
  const terminalTitle = value.terminalTitle === undefined ? undefined : validatedField(value.terminalTitle, false)
  const sessionId = value.sessionId === undefined ? undefined : validatedTerminalKey(value.sessionId)
  const contextKindValid =
    value.contextKind === 'worktree' ||
    value.contextKind === 'workspace' ||
    value.contextKind === 'branch-workspace' ||
    value.contextKind === 'directory'
  if (
    !terminalKey ||
    !project ||
    !context ||
    !directory ||
    !contextKindValid ||
    !Number.isInteger(value.terminalIndex) ||
    value.terminalIndex < 1 ||
    value.terminalIndex > 9_999 ||
    (value.branch !== undefined && !branch) ||
    (value.terminalTitle !== undefined && !terminalTitle) ||
    (value.sessionId !== undefined && !sessionId)
  ) {
    return null
  }
  return {
    terminalKey,
    project,
    contextKind: value.contextKind,
    context,
    directory,
    ...(branch ? { branch } : {}),
    terminalIndex: value.terminalIndex,
    ...(terminalTitle ? { terminalTitle } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

function writeDependencies(options: TelegramNotificationWriteOptions) {
  return {
    getSettingsPrefs: options.getSettingsPrefs ?? getServerSettingsPrefs,
    getTelegramConfig: options.getTelegramConfig ?? getServerTelegramNotificationConfig,
    sendMessage: options.sendMessage ?? sendTelegramMessage,
    sendPhoto: options.sendPhoto ?? sendTelegramPhoto,
    readTerminalScreenSnapshot: options.readTerminalScreenSnapshot,
    renderTerminalScreenImage: options.renderTerminalScreenImage ?? defaultRenderTerminalScreenImage,
    now: options.now ?? Date.now,
    warn:
      options.warn ??
      ((code: string) => telegramNotificationLogger.warn({ code }, 'Telegram notification delivery failed')),
  }
}

async function sendConfiguredMessage(
  text: string,
  prefs: SettingsPrefs,
  config: TelegramConfig,
  options: TelegramNotificationWriteOptions,
): Promise<TelegramNotificationResult> {
  if (!config.botToken || !config.chatId) return { ok: false, error: { code: 'configuration-incomplete' } }
  const dependencies = writeDependencies(options)
  const proxyUrl = telegramProxyUrlFromPrefs(prefs, config.proxyEnabled)
  const result = await dependencies.sendMessage({
    botToken: config.botToken,
    chatId: config.chatId,
    text,
    ...(proxyUrl ? { proxyUrl } : {}),
  })
  if (!result.ok) dependencies.warn(result.error.code)
  return result
}

async function sendConfiguredPhoto(
  caption: string,
  photo: Buffer,
  prefs: SettingsPrefs,
  config: TelegramConfig,
  options: TelegramNotificationWriteOptions,
): Promise<TelegramNotificationResult> {
  if (!config.botToken || !config.chatId) return { ok: false, error: { code: 'configuration-incomplete' } }
  const dependencies = writeDependencies(options)
  const proxyUrl = telegramProxyUrlFromPrefs(prefs, config.proxyEnabled)
  const result = await dependencies.sendPhoto({
    botToken: config.botToken,
    chatId: config.chatId,
    caption,
    photo,
    ...(proxyUrl ? { proxyUrl } : {}),
  })
  if (!result.ok) dependencies.warn(result.error.code)
  return result
}

async function sendTerminalScreenNotification(
  context: TelegramBellNotificationContext,
  text: string,
  caption: string,
  prefs: SettingsPrefs,
  config: TelegramConfig,
  options: TelegramNotificationWriteOptions,
  dependencies: ReturnType<typeof writeDependencies>,
): Promise<TelegramNotificationResult> {
  const sessionId = context.sessionId
  if (!config.includeTerminalOutput || !sessionId || !dependencies.readTerminalScreenSnapshot) {
    return await sendConfiguredMessage(text, prefs, config, options)
  }

  const result = await terminalScreenMediaQueue.add(async () => {
    const snapshot = await dependencies
      .readTerminalScreenSnapshot?.({
        sessionId,
        maxColumns: TELEGRAM_TERMINAL_SCREEN_MAX_COLUMNS,
        maxRows: TELEGRAM_TERMINAL_SCREEN_MAX_ROWS,
      })
      .catch(() => null)
    const photo = snapshot ? await dependencies.renderTerminalScreenImage(snapshot).catch(() => null) : null
    if (photo) return await sendConfiguredPhoto(caption, photo, prefs, config, options)
    return await sendConfiguredMessage(text, prefs, config, options)
  })
  return result ?? { ok: false, error: { code: 'network-failed' } }
}

export async function sendConfiguredTelegramTestNotification(
  options: TelegramNotificationWriteOptions = {},
): Promise<TelegramNotificationResult> {
  const dependencies = writeDependencies(options)
  const [prefs, config] = await Promise.all([dependencies.getSettingsPrefs(), dependencies.getTelegramConfig()])
  const lang = resolvePreferredLang(prefs.lang, options.acceptLanguage)
  const dict = DICTS[lang]
  const text = [dict['telegram.notification.message.test-title'], dict['telegram.notification.message.test-body']].join(
    '\n',
  )
  return await sendConfiguredMessage(text, prefs, config, options)
}

export async function sendConfiguredTelegramBellNotification(
  context: TelegramBellNotificationContext,
  options: TelegramNotificationWriteOptions = {},
): Promise<TelegramNotificationResult> {
  const dependencies = writeDependencies(options)
  const [prefs, config] = await Promise.all([dependencies.getSettingsPrefs(), dependencies.getTelegramConfig()])
  if (!prefs.terminalNotificationsEnabled || !config.enabled || !config.bellEnabled) return { ok: true }

  const safeContext = validatedContext(context)
  if (!safeContext) return { ok: false, error: { code: 'invalid-input' } }
  if (!config.botToken || !config.chatId) return { ok: false, error: { code: 'configuration-incomplete' } }

  const now = dependencies.now()
  const lastBellAt = lastBellAtByTerminal.get(safeContext.terminalKey)
  if (lastBellAt !== undefined && now - lastBellAt < TELEGRAM_BELL_DEBOUNCE_MS) return { ok: true }
  lastBellAtByTerminal.set(safeContext.terminalKey, now)
  if (lastBellAtByTerminal.size > 1_000) {
    for (const [terminalKey, timestamp] of lastBellAtByTerminal) {
      if (now - timestamp >= TELEGRAM_BELL_DEBOUNCE_MS) lastBellAtByTerminal.delete(terminalKey)
    }
  }

  const lang = resolvePreferredLang(prefs.lang, options.acceptLanguage)
  return await sendTerminalScreenNotification(
    safeContext,
    formatTelegramBellMessage(safeContext, lang),
    formatTelegramBellPhotoCaption(safeContext, lang),
    prefs,
    config,
    options,
    dependencies,
  )
}

export async function sendConfiguredTelegramOutputCompletionNotification(
  context: TelegramOutputCompletionNotificationContext,
  options: TelegramNotificationWriteOptions = {},
): Promise<TelegramNotificationResult> {
  const dependencies = writeDependencies(options)
  const [prefs, config] = await Promise.all([dependencies.getSettingsPrefs(), dependencies.getTelegramConfig()])
  if (!prefs.terminalNotificationsEnabled || !config.enabled || !config.outputCompletionEnabled) return { ok: true }

  const safeContext = validatedContext(context)
  const sessionId = safeContext?.sessionId
  const finalOutputSeq = context?.finalOutputSeq
  const activityDurationMs = context?.activityDurationMs
  if (
    !safeContext ||
    !sessionId ||
    !Number.isSafeInteger(finalOutputSeq) ||
    finalOutputSeq < 0 ||
    !Number.isSafeInteger(activityDurationMs) ||
    activityDurationMs < 0
  ) {
    return { ok: false, error: { code: 'invalid-input' } }
  }
  if (activityDurationMs < config.outputCompletionMinimumActivitySeconds * 1_000) return { ok: true }
  if (!config.botToken || !config.chatId) return { ok: false, error: { code: 'configuration-incomplete' } }

  const now = dependencies.now()
  const completionKey = `${sessionId}\0${finalOutputSeq}`
  if (completionAtByCycle.has(completionKey)) return { ok: true }
  completionAtByCycle.set(completionKey, now)
  if (completionAtByCycle.size > TELEGRAM_COMPLETION_CACHE_MAX_ENTRIES) {
    for (const [key, timestamp] of completionAtByCycle) {
      if (now - timestamp >= TELEGRAM_COMPLETION_CACHE_TTL_MS) completionAtByCycle.delete(key)
    }
  }

  const lang = resolvePreferredLang(prefs.lang, options.acceptLanguage)
  return await sendTerminalScreenNotification(
    safeContext,
    formatTelegramOutputCompletionMessage(safeContext, lang),
    formatTelegramPhotoCaption(safeContext, lang),
    prefs,
    config,
    options,
    dependencies,
  )
}

export function resetTelegramNotificationWritePathsForTests(): void {
  lastBellAtByTerminal.clear()
  completionAtByCycle.clear()
  terminalScreenMediaQueue.clear()
}
