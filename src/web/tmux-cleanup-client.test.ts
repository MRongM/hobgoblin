import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postServerJson: vi.fn() }))

vi.mock('#/web/lib/server-fetch.ts', () => mocks)

import { cleanupAssociatedTmuxSessions, previewAssociatedTmuxSessions } from '#/web/tmux-cleanup-client.ts'

describe('tmux cleanup client', () => {
  beforeEach(() => mocks.postServerJson.mockReset())

  test('posts preview and execute requests with cancellation', async () => {
    const controller = new AbortController()
    mocks.postServerJson.mockResolvedValue({ ok: true })

    await previewAssociatedTmuxSessions({ projectRoot: '/work/repo', itemPath: '/work/feature' }, controller.signal)
    await cleanupAssociatedTmuxSessions(
      { projectRoot: '/work/repo', itemPath: '/work/feature', approvedSessionIds: ['$1'] },
      controller.signal,
    )

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(
      1,
      '/api/tmux-cleanup/preview',
      { projectRoot: '/work/repo', itemPath: '/work/feature' },
      { signal: controller.signal },
    )
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(
      2,
      '/api/tmux-cleanup/execute',
      { projectRoot: '/work/repo', itemPath: '/work/feature', approvedSessionIds: ['$1'] },
      { signal: controller.signal },
    )
  })
})
