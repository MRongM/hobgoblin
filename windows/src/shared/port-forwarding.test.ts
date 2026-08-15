import { describe, expect, test } from 'vitest'
import {
  formatPortForwardLocalUrl,
  isLoopbackBindHost,
  normalizePortForwardStartRequest,
  validatePortForwardHost,
} from '#/shared/port-forwarding.ts'

describe('port forwarding shared model', () => {
  test('normalizes defaults for a remote start request', () => {
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 3000 })).toEqual({
      ok: true,
      request: {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '127.0.0.1',
        localPort: null,
        remoteHost: '127.0.0.1',
        remotePort: 3000,
      },
    })
  })

  test('normalizes string ports from route and form bodies', () => {
    expect(
      normalizePortForwardStartRequest({
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '0.0.0.0',
        localPort: '5173',
        remoteHost: 'localhost',
        remotePort: '3000',
      }),
    ).toEqual({
      ok: true,
      request: {
        repoId: 'ssh-config://prod/srv/repo',
        localBindHost: '0.0.0.0',
        localPort: 5173,
        remoteHost: 'localhost',
        remotePort: 3000,
      },
    })
  })

  test('rejects invalid hosts and ports', () => {
    expect(validatePortForwardHost('localhost')).toEqual({ ok: true, host: 'localhost' })
    expect(validatePortForwardHost('api.internal')).toEqual({ ok: true, host: 'api.internal' })
    expect(validatePortForwardHost('bad host')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(validatePortForwardHost('127.0.0.1:3000')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(validatePortForwardHost('')).toEqual({ ok: false, message: 'error.invalid-host' })
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 0 })).toEqual({
      ok: false,
      message: 'error.invalid-port',
    })
    expect(normalizePortForwardStartRequest({ repoId: 'ssh-config://prod/srv/repo', remotePort: 65536 })).toEqual({
      ok: false,
      message: 'error.invalid-port',
    })
  })

  test('formats browser-safe local URLs', () => {
    expect(formatPortForwardLocalUrl('127.0.0.1', 3000)).toBe('http://127.0.0.1:3000')
    expect(formatPortForwardLocalUrl('localhost', 3000)).toBe('http://localhost:3000')
    expect(formatPortForwardLocalUrl('0.0.0.0', 3000)).toBe('http://127.0.0.1:3000')
  })

  test('detects loopback bind hosts', () => {
    expect(isLoopbackBindHost('127.0.0.1')).toBe(true)
    expect(isLoopbackBindHost('localhost')).toBe(true)
    expect(isLoopbackBindHost('0.0.0.0')).toBe(false)
  })
})
