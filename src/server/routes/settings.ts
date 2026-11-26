import { Hono } from 'hono'
import * as v from 'valibot'
import { getServerExternalAppsSnapshot } from '#/server/modules/external-apps.ts'
import { publishSettingsInvalidation } from '#/server/modules/invalidation-broker.ts'
import { getServerI18nSnapshot } from '#/server/modules/i18n.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import { openAppConfigDirectoryInEditor } from '#/server/modules/settings-external-actions.ts'
import { getSettingsSnapshot } from '#/server/modules/settings-snapshot.ts'
import { getServerSettingsPrefs } from '#/server/modules/settings-source.ts'
import type { ServerSettingsState } from '#/server/modules/settings-state.ts'
import {
  applyServerFetchIntervalWrite,
  applyServerRecentRepoAddWrite,
  applyServerRecentRepoClearWrite,
  applyServerRepoThemeWrite,
  applyServerSessionWrite,
  applyServerSettingsPrefsWrite,
  applyServerWebAccessSettingsWrite,
  applyServerTelegramNotificationSettingsWrite,
} from '#/server/modules/settings-write-paths.ts'
import { getLanUrls, isLanAddress } from '#/shared/lan-addresses.ts'
import type { LanInfo } from '#/shared/rpc.ts'
import type { WindowsInternalTerminalShellPref } from '#/shared/settings.ts'

const WEB_ACCESS_ERROR_CODES = new Set([
  'username-required',
  'username-invalid',
  'password-required',
  'password-too-short',
  'password-too-long',
])
const TELEGRAM_SETTINGS_ERROR_CODES = new Set(['configuration-incomplete', 'invalid-input'])
const GenerateOpenApiKeySchema = v.strictObject({ replace: v.boolean() })

function readWebAccessErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && WEB_ACCESS_ERROR_CODES.has(code) ? code : null
}

function readTelegramSettingsErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && TELEGRAM_SETTINGS_ERROR_CODES.has(code) ? code : null
}

export function createSettingsRoutes(
  settingsState: ServerSettingsState,
  options: {
    revokeAllWebSessions?: () => void
    openApiKeys?: OpenApiKeyStore
    onTelegramRuntimeConfigChanged?: () => void | Promise<void>
    onWindowsInternalTerminalShellChanged?: (preference: WindowsInternalTerminalShellPref) => void
  } = {},
) {
  const app = new Hono()
  app.get('/', async (c) => c.json(await getSettingsSnapshot(settingsState)))
  app.get('/i18n', async (c) => c.json(await getServerI18nSnapshot(c.req.header('accept-language'))))
  app.get('/external-apps', async (c) => c.json(await getServerExternalAppsSnapshot(c.req.raw.signal)))
  app.post('/external-apps/refresh', async (c) => c.json(await getServerExternalAppsSnapshot(c.req.raw.signal)))
  app.post('/open-app-config-editor', async (c) => c.json(await openAppConfigDirectoryInEditor()))
  app.get('/prefs', async (c) => c.json(await getServerSettingsPrefs()))
  app.get('/open-api-key', (c) => {
    if (!options.openApiKeys) return c.json({ error: 'open_api_key_management_unavailable' }, 503)
    return c.json(options.openApiKeys.status())
  })
  app.post('/open-api-key', async (c) => {
    if (!options.openApiKeys) return c.json({ error: 'open_api_key_management_unavailable' }, 503)
    const input = v.safeParse(GenerateOpenApiKeySchema, await c.req.json().catch(() => null))
    if (!input.success) return c.json({ error: 'invalid_request' }, 400)
    const result = await options.openApiKeys.generate(input.output.replace)
    if (!result) return c.json({ error: 'open_api_key_exists' }, 409)
    publishSettingsInvalidation(['open-api-keys'])
    return c.json(result, 201)
  })
  app.get('/lan', async (c) => {
    const host = process.env.GOBLIN_SERVER_HOST?.trim() || '127.0.0.1'
    const port = Number(process.env.GOBLIN_SERVER_PORT) || 32200
    const lanUrls = host === '0.0.0.0' ? getLanUrls(port) : isLanAddress(host) ? [`http://${host}:${port}`] : []
    return c.json({ host, port, lanUrls } satisfies LanInfo)
  })
  app.post('/fetch-interval', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(await applyServerFetchIntervalWrite(body))
  })
  app.post('/prefs', async (c) => {
    const body = await c.req.json().catch(() => null)
    const result = await applyServerSettingsPrefsWrite(body, {
      acceptLanguage: c.req.header('accept-language'),
      signal: c.req.raw.signal,
    })
    options.onWindowsInternalTerminalShellChanged?.(result.settings.windowsInternalTerminalShell)
    await options.onTelegramRuntimeConfigChanged?.()
    return c.json(result)
  })
  app.post('/web-access', async (c) => {
    const body = await c.req.json().catch(() => null)
    try {
      return c.json(
        await applyServerWebAccessSettingsWrite(body, {
          revokeAllWebSessions: options.revokeAllWebSessions ?? (() => undefined),
        }),
      )
    } catch (error) {
      const code = readWebAccessErrorCode(error)
      if (!code) throw error
      return c.json({ ok: false as const, error: { code } }, 400)
    }
  })
  app.post('/telegram', async (c) => {
    const body = await c.req.json().catch(() => null)
    try {
      const result = await applyServerTelegramNotificationSettingsWrite(body)
      await options.onTelegramRuntimeConfigChanged?.()
      return c.json(result)
    } catch (error) {
      const code = readTelegramSettingsErrorCode(error)
      if (!code) throw error
      return c.json({ ok: false as const, error: { code } })
    }
  })
  app.post('/session', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(await applyServerSessionWrite(body))
  })
  app.post('/recent-repos/add', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(await applyServerRecentRepoAddWrite(body))
  })
  app.post('/recent-repos/clear', async (c) => c.json(await applyServerRecentRepoClearWrite()))
  app.post('/repo-theme', async (c) => {
    const body = await c.req.json().catch(() => null)
    return c.json(await applyServerRepoThemeWrite(body))
  })
  return app
}
