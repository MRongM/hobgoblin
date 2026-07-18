import { describe, expect, test, vi } from 'vitest'
import type { WebAccessAuth } from '#/server/modules/web-access-auth.ts'
import { createWebAccessAuthRoutes } from '#/server/routes/web-access-auth.ts'

describe('web access auth routes', () => {
  test('renders a no-store login form with a safe return path', async () => {
    const app = createWebAccessAuthRoutes({ auth: fakeAuth() })

    const response = await app.request('/login?next=%2Fsettings%2Fsecurity')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(html).toContain('Sign in to Hobgoblin')
    expect(html).toContain('name="next" value="/settings/security"')
    expect(html).toContain('autocomplete="username"')
    expect(html).toContain('autocomplete="current-password"')
  })

  test('returns one generic error for invalid credentials', async () => {
    const auth = fakeAuth({ authenticate: vi.fn(async () => null) })
    const app = createWebAccessAuthRoutes({ auth })

    const response = await app.request('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'operator', password: 'wrong-password', next: '/settings' }),
    })

    expect(response.status).toBe(401)
    expect(await response.text()).toContain('The username or password is incorrect.')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('sets a seven-day strict HttpOnly cookie and redirects after login', async () => {
    const auth = fakeAuth({ authenticate: vi.fn(async () => 'authenticated-token') })
    const app = createWebAccessAuthRoutes({ auth })

    const response = await app.request('http://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'operator', password: 'test-password', next: '/settings/security' }),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/settings/security')
    expect(response.headers.get('set-cookie')).toContain('goblin_web_session=authenticated-token')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=604800')
    expect(response.headers.get('set-cookie')).toContain('Path=/')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=Strict')
    expect(response.headers.get('set-cookie')).not.toContain('Secure')
  })

  test('uses Secure cookies over HTTPS and rejects cross-origin redirect targets', async () => {
    const auth = fakeAuth({ authenticate: vi.fn(async () => 'authenticated-token') })
    const app = createWebAccessAuthRoutes({ auth })

    const response = await app.request('https://localhost/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'operator', password: 'test-password', next: '//example.test/path' }),
    })

    expect(response.headers.get('location')).toBe('/')
    expect(response.headers.get('set-cookie')).toContain('Secure')
  })

  test('revokes the current session and expires its cookie on logout', async () => {
    const revokeToken = vi.fn()
    const app = createWebAccessAuthRoutes({ auth: fakeAuth({ revokeToken }) })

    const response = await app.request('/logout', {
      method: 'POST',
      headers: { cookie: 'goblin_web_session=authenticated-token' },
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/auth/login')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(revokeToken).toHaveBeenCalledWith('authenticated-token')
  })
})

function fakeAuth(overrides: Partial<WebAccessAuth> = {}): WebAccessAuth {
  return {
    protectionEnabled: async () => true,
    createPageCapability: async () => null,
    authenticate: async () => null,
    validateToken: async () => false,
    revokeToken: () => {},
    revokeAll: () => {},
    ...overrides,
  }
}
