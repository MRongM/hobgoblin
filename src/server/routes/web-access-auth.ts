import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { WebAccessAuth } from '#/server/modules/web-access-auth.ts'
import { resolveI18nSnapshot } from '#/shared/i18n/snapshot.ts'

export const WEB_ACCESS_SESSION_COOKIE = 'goblin_web_session'
const WEB_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

interface WebAccessAuthRouteOptions {
  auth: WebAccessAuth
}

interface LoginCopy {
  title: string
  description: string
  username: string
  password: string
  submit: string
  invalid: string
}

export function createWebAccessAuthRoutes({ auth }: WebAccessAuthRouteOptions): Hono {
  const app = new Hono()

  app.get('/login', async (c) => {
    if (!(await auth.protectionEnabled())) return noStoreRedirect(c, '/', 303)
    return loginResponse(c, safeReturnPath(c.req.query('next')), false)
  })

  app.post('/login', async (c) => {
    if (!(await auth.protectionEnabled())) return noStoreRedirect(c, '/', 303)
    const body = await c.req.parseBody()
    const username = stringField(body.username)
    const password = stringField(body.password)
    const next = safeReturnPath(stringField(body.next))
    const token = await auth.authenticate(username, password)
    if (!token) return loginResponse(c, next, true)
    setSessionCookie(c, token, new URL(c.req.url).protocol === 'https:')
    return noStoreRedirect(c, next, 303)
  })

  app.post('/logout', (c) => {
    const token = getCookie(c, WEB_ACCESS_SESSION_COOKIE)
    if (token) auth.revokeToken(token)
    setCookie(c, WEB_ACCESS_SESSION_COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: new URL(c.req.url).protocol === 'https:',
      maxAge: 0,
    })
    return noStoreRedirect(c, '/auth/login', 303)
  })

  return app
}

export function readWebAccessSessionCookie(c: Context): string | null {
  return getCookie(c, WEB_ACCESS_SESSION_COOKIE) ?? null
}

function loginResponse(c: Context, next: string, invalid: boolean): Response {
  const copy = loginCopy(c.req.header('accept-language'))
  c.header('Cache-Control', 'no-store')
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  )
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  return c.html(renderLoginHtml(copy, next, invalid), invalid ? 401 : 200)
}

function noStoreRedirect(c: Context, location: string, status: 303): Response {
  c.header('Cache-Control', 'no-store')
  return c.redirect(location, status)
}

function setSessionCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, WEB_ACCESS_SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    secure,
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
  })
}

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const parsed = new URL(value, 'http://localhost')
    return parsed.origin === 'http://localhost' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/'
  } catch {
    return '/'
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function loginCopy(acceptLanguage: string | undefined): LoginCopy {
  const dict = resolveI18nSnapshot('auto', acceptLanguage).dict
  return {
    title: dict['web-access.login.title'] ?? 'Sign in to Hobgoblin',
    description: dict['web-access.login.description'] ?? 'Enter the credentials configured on this Hobgoblin host.',
    username: dict['web-access.login.username'] ?? 'Username',
    password: dict['web-access.login.password'] ?? 'Password',
    submit: dict['web-access.login.submit'] ?? 'Sign in',
    invalid: dict['web-access.login.invalid'] ?? 'The username or password is incorrect.',
  }
}

function renderLoginHtml(copy: LoginCopy, next: string, invalid: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(copy.title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #111318; color: #f4f5f7; }
    main { width: min(100%, 360px); border: 1px solid #343943; border-radius: 14px; background: #1a1d23; box-shadow: 0 22px 70px rgb(0 0 0 / 38%); overflow: hidden; }
    header { display: flex; gap: 12px; align-items: center; padding: 22px 22px 16px; border-bottom: 1px solid #2b3038; }
    img { width: 38px; height: 38px; border-radius: 9px; }
    h1 { margin: 0; font-size: 18px; line-height: 1.25; }
    p { margin: 5px 0 0; color: #a9b0bc; font-size: 12px; line-height: 1.45; }
    form { display: grid; gap: 14px; padding: 20px 22px 22px; }
    label { display: grid; gap: 6px; color: #c7ccd4; font-size: 12px; }
    input { width: 100%; height: 38px; border: 1px solid #3b424e; border-radius: 8px; padding: 0 11px; background: #12151a; color: #f4f5f7; font: inherit; outline: none; }
    input:focus { border-color: #7c95ff; box-shadow: 0 0 0 3px rgb(124 149 255 / 18%); }
    button { height: 38px; border: 0; border-radius: 8px; background: #6f86ee; color: #fff; font: 600 13px/1 ui-sans-serif, sans-serif; cursor: pointer; }
    button:hover { background: #7c92f4; }
    .error { margin: 0; border: 1px solid #6d3940; border-radius: 8px; padding: 9px 10px; background: #301c20; color: #ffb7bf; }
    @media (prefers-color-scheme: light) {
      body { background: #eef0f4; color: #17191d; }
      main { border-color: #d7dbe2; background: #fff; box-shadow: 0 22px 70px rgb(27 31 40 / 14%); }
      header { border-color: #e6e8ec; }
      p { color: #626b78; }
      label { color: #424955; }
      input { border-color: #cbd0d8; background: #f8f9fb; color: #17191d; }
      .error { border-color: #efc3c8; background: #fff1f2; color: #a32635; }
    }
  </style>
</head>
<body>
  <main>
    <header><img src="/goblin.png" alt="" /><div><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.description)}</p></div></header>
    <form method="post" action="/auth/login">
      <input type="hidden" name="next" value="${escapeHtml(next)}" />
      ${invalid ? `<p class="error" role="alert">${escapeHtml(copy.invalid)}</p>` : ''}
      <label>${escapeHtml(copy.username)}<input name="username" autocomplete="username" required autofocus /></label>
      <label>${escapeHtml(copy.password)}<input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">${escapeHtml(copy.submit)}</button>
    </form>
  </main>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    if (character === '&') return '&amp;'
    if (character === '<') return '&lt;'
    if (character === '>') return '&gt;'
    if (character === '"') return '&quot;'
    return '&#39;'
  })
}
