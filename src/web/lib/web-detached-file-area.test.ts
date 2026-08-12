// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'

const HANDOFF_ID = '3f4ca5c2-9cb4-4b82-a930-95e19a572db8'
const request: DetachedFileAreaWindowRequest = {
  kind: 'git-worktree',
  repo: { kind: 'local', id: '/repo' },
  branch: 'feature/web-window',
  tab: 'history',
  releasePoint: { x: 1200, y: 420 },
}

describe('Web detached file area handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T08:00:00.000Z'))
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/workspace')
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(HANDOFF_ID)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  test('opens a same-origin popup with only an opaque handoff id and consumes the request once', async () => {
    const replace = vi.fn()
    const popup = { opener: window, location: { replace }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const { consumeWebDetachedFileAreaWindowHandoff, openWebDetachedFileAreaWindow } =
      await import('#/web/lib/web-detached-file-area.ts')

    expect(openWebDetachedFileAreaWindow(request)).toEqual({
      ok: true,
      windowKey: `web-detached-file-area:${HANDOFF_ID}`,
    })
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank', 'popup,width=960,height=720,left=1120,top=402')
    expect(popup.opener).toBeNull()
    const targetUrl = String(replace.mock.calls[0]?.[0])
    expect(targetUrl).toBe(`http://localhost:3000/detached/file-area?handoff=${HANDOFF_ID}`)
    expect(targetUrl).not.toContain('/repo')
    expect(targetUrl).not.toContain('feature')
    expect(window.sessionStorage.length).toBe(1)
    expect(window.localStorage.length).toBe(0)

    window.sessionStorage.setItem(
      'hobgoblin:detached-file-area:unrelated-handoff',
      JSON.stringify({ createdAt: Date.now(), request }),
    )

    window.history.replaceState({}, '', `/detached/file-area?handoff=${HANDOFF_ID}`)
    expect(consumeWebDetachedFileAreaWindowHandoff()).toEqual(request)
    expect(consumeWebDetachedFileAreaWindowHandoff()).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  test('cleans up the handoff when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { openWebDetachedFileAreaWindow } = await import('#/web/lib/web-detached-file-area.ts')

    expect(openWebDetachedFileAreaWindow(request)).toEqual({
      ok: false,
      message: 'error.failed-open-window',
    })
    expect(window.sessionStorage.length).toBe(0)
  })

  test('rejects and removes an expired handoff', async () => {
    const replace = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue({
      opener: window,
      location: { replace },
      close: vi.fn(),
    } as unknown as Window)
    const { consumeWebDetachedFileAreaWindowHandoff, openWebDetachedFileAreaWindow } =
      await import('#/web/lib/web-detached-file-area.ts')
    openWebDetachedFileAreaWindow(request)
    vi.setSystemTime(new Date('2026-07-22T08:01:01.000Z'))
    window.history.replaceState({}, '', `/detached/file-area?handoff=${HANDOFF_ID}`)

    expect(consumeWebDetachedFileAreaWindowHandoff()).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
  })

  test('treats unavailable browser storage as a missing handoff', async () => {
    window.history.replaceState({}, '', `/detached/file-area?handoff=${HANDOFF_ID}`)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })
    const { consumeWebDetachedFileAreaWindowHandoff } = await import('#/web/lib/web-detached-file-area.ts')

    expect(consumeWebDetachedFileAreaWindowHandoff()).toBeNull()
  })
})
