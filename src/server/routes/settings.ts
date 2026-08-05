import { Hono } from 'hono'
import { getServerExternalAppsSnapshot } from '#/server/modules/external-apps.ts'
import { getServerI18nSnapshot } from '#/server/modules/i18n.ts'
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

const WEB_ACCESS_ERROR_CODES = new Set([
  'username-required',
  'username-invalid',
  'password-required',
  'password-too-short',
  'password-too-long',
])
const TELEGRAM_SETTINGS_ERROR_CODES = new Set(['configuration-incomplete', 'invalid-input'])

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
  options: { revokeAllWebSessions?: () => void } = {},
) {
  const app = new Hono()
  app.get('/', async (c) => c.json(await getSettingsSnapshot(settingsState)))
  app.get('/i18n', async (c) => c.json(await getServerI18nSnapshot(c.req.header('accept-language'))))
  app.get('/external-apps', async (c) => c.json(await getServerExternalAppsSnapshot(c.req.raw.signal)))
  app.post('/external-apps/refresh', async (c) => c.json(await getServerExternalAppsSnapshot(c.req.raw.signal)))
  app.get('/prefs', async (c) => c.json(await getServerSettingsPrefs()))
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
    return c.json(
      await applyServerSettingsPrefsWrite(body, {
        acceptLanguage: c.req.header('accept-language'),
        signal: c.req.raw.signal,
      }),
    )
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
      return c.json(await applyServerTelegramNotificationSettingsWrite(body))
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
