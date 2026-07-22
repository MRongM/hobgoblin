import { access, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { createInternalAuthMiddleware } from '#/server/common/auth.ts'
import { createWebAccessAuth } from '#/server/modules/web-access-auth.ts'
import { createHealthRoutes } from '#/server/routes/health.ts'
import { createPortForwardingRoutes } from '#/server/routes/port-forwarding.ts'
import { createRemoteRoutes } from '#/server/routes/remote.ts'
import { createRealtimeRoutes } from '#/server/routes/realtime.ts'
import { createRepoRoutes } from '#/server/routes/repo.ts'
import { createSettingsRoutes } from '#/server/routes/settings.ts'
import { createTelegramNotificationRoutes } from '#/server/routes/telegram-notifications.ts'
import { createWorkspaceRoutes } from '#/server/routes/workspace.ts'
import { createWebAccessAuthRoutes, readWebAccessSessionCookie } from '#/server/routes/web-access-auth.ts'
import type { ServerTerminalHost } from '#/server/terminal/terminal-host.ts'
import { getServerSettingsPrefs, getServerWebAccessCredentials } from '#/server/modules/settings-source.ts'
import { createServerSettingsState } from '#/server/modules/settings-state.ts'
import { createRendererBootstrapSnapshot, toInitialServerSnapshot } from '#/shared/bootstrap-builders.ts'
import { createRendererRuntimeSnapshot } from '#/shared/bootstrap-builders.ts'
import { WEB_RENDERER_CAPABILITIES } from '#/shared/bootstrap.ts'
import { resolveI18nSnapshot } from '#/shared/i18n/snapshot.ts'
import { initialSettingsFromSnapshot } from '#/shared/settings-defaults.ts'
import type { LangPref } from '#/shared/rpc.ts'
import type { RendererBootstrapSnapshot } from '#/shared/bootstrap.ts'

export interface ServerAppOptions {
  version: string
  startedAt: number
  internalSecret: string
  terminalHost: ServerTerminalHost
}

const WEB_DIST_DIR = path.resolve(import.meta.dirname, '../../dist/web')
const WEB_INDEX_HTML = path.join(WEB_DIST_DIR, 'index.html')
const INTERNAL_CAPABILITY_HEADER = 'x-goblin-internal-secret'
function deriveServerClientId(secret: string): string {
  return `client_${createHash('sha256').update(secret).digest('hex').slice(0, 32)}`
}

function buildWebBootstrap(
  requestUrl: string,
  webCapability: string,
  terminalClientId: string,
  acceptLanguageHeader: string | null,
  langPref: LangPref,
  settings: Awaited<ReturnType<typeof getServerSettingsPrefs>>,
): RendererBootstrapSnapshot {
  const origin = new URL(requestUrl).origin
  return createRendererBootstrapSnapshot({
    runtime: createRendererRuntimeSnapshot('web', WEB_RENDERER_CAPABILITIES),
    homeDir: os.homedir(),
    i18n: resolveI18nSnapshot(langPref, acceptLanguageHeader),
    settings: initialSettingsFromSnapshot({
      ...settings,
      globalShortcutRegistered: false,
    }),
    server: toInitialServerSnapshot({
      url: `${origin}/`,
      secret: webCapability,
      clientId: terminalClientId,
    }),
  })
}

function escapeBootstrapJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function injectBootstrapIntoHtml(indexHtml: string, bootstrap: RendererBootstrapSnapshot): string {
  const baseHref = bootstrap.initialServer ? `${new URL(bootstrap.initialServer.url).origin}/` : '/'
  const bootstrapScript = `<script id="goblin-bootstrap" type="application/json">${escapeBootstrapJson(bootstrap)}</script>`
  return indexHtml
    .replace('<html lang="en">', `<html lang="${bootstrap.initialI18n?.lang ?? 'en'}">`)
    .replace('<head>', `<head>\n    <base href="${baseHref}">`)
    .replace(
      '<script type="module" src="./boot.js"></script>',
      `${bootstrapScript}\n    <script type="module" src="./boot.js"></script>`,
    )
}

async function renderRendererIndexHtml(
  requestUrl: string,
  webCapability: string,
  terminalClientId: string,
  acceptLanguageHeader: string | null,
): Promise<string> {
  await access(WEB_INDEX_HTML)
  const settings = await getServerSettingsPrefs()
  const bootstrap = buildWebBootstrap(
    requestUrl,
    webCapability,
    terminalClientId,
    acceptLanguageHeader,
    settings.lang,
    settings,
  )
  return injectBootstrapIntoHtml(await readFile(WEB_INDEX_HTML, 'utf8'), bootstrap)
}

function noStoreHtml(c: Context, html: string): Response {
  c.header('Cache-Control', 'no-store')
  return c.html(html)
}

export function createApp(options: ServerAppOptions): Hono {
  const settingsState = createServerSettingsState()
  const webAccessAuth = createWebAccessAuth({ readCredentials: getServerWebAccessCredentials })
  const terminalClientId = deriveServerClientId(options.internalSecret)
  const capabilityMiddleware = createInternalAuthMiddleware(options.internalSecret, {
    validateWebSession: webAccessAuth.validateToken,
  })
  const app = new Hono()
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.use(
    '/api/*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'x-goblin-internal-secret'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  app.route(
    '/api',
    createHealthRoutes({ version: options.version, startedAt: options.startedAt, terminalHost: options.terminalHost }),
  )
  app.use('/api/settings/*', capabilityMiddleware)
  app.use('/api/telegram-notifications/*', capabilityMiddleware)
  app.use('/api/remote/*', capabilityMiddleware)
  app.use('/api/repo/*', capabilityMiddleware)
  app.use('/api/workspace/*', capabilityMiddleware)
  app.use('/api/port-forwarding/*', capabilityMiddleware)
  app.route('/api/settings', createSettingsRoutes(settingsState, { revokeAllWebSessions: webAccessAuth.revokeAll }))
  app.route('/api/telegram-notifications', createTelegramNotificationRoutes())
  app.route('/api/remote', createRemoteRoutes())
  app.route('/api/repo', createRepoRoutes())
  app.route('/api/workspace', createWorkspaceRoutes({ terminalHost: options.terminalHost, terminalClientId }))
  app.route('/api/port-forwarding', createPortForwardingRoutes())
  app.route(
    '/ws',
    createRealtimeRoutes({
      internalSecret: options.internalSecret,
      validateWebSession: webAccessAuth.validateToken,
      terminalHost: options.terminalHost,
    }),
  )
  app.route('/auth', createWebAccessAuthRoutes({ auth: webAccessAuth }))
  const renderProtectedHtml = async (c: Context): Promise<Response> => {
    const requestCapability = c.req.header(INTERNAL_CAPABILITY_HEADER) ?? ''
    const internalCapabilityValid = Boolean(options.internalSecret) && requestCapability === options.internalSecret
    const pageCapability = internalCapabilityValid
      ? options.internalSecret
      : await webAccessAuth.createPageCapability(readWebAccessSessionCookie(c))
    if (!pageCapability) return redirectToLogin(c)
    try {
      return noStoreHtml(
        c,
        await renderRendererIndexHtml(
          c.req.url,
          pageCapability,
          terminalClientId,
          c.req.header('accept-language') ?? null,
        ),
      )
    } catch {
      return c.text('Not Found', 404)
    }
  }
  app.get('/', renderProtectedHtml)
  app.get('/index.html', renderProtectedHtml)
  app.get('/settings', renderProtectedHtml)
  app.get('/settings/*', renderProtectedHtml)
  app.use('/*', serveStatic({ root: WEB_DIST_DIR }))
  app.get('*', renderProtectedHtml)
  return app
}

function redirectToLogin(c: Context): Response {
  const url = new URL(c.req.url)
  const next = `${url.pathname}${url.search}`
  c.header('Cache-Control', 'no-store')
  return c.redirect(`/auth/login?next=${encodeURIComponent(next)}`, 303)
}
