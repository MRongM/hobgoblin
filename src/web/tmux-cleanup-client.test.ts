import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ postServerJson: vi.fn() }))

vi.mock('#/web/lib/server-fetch.ts', () => mocks)

import { cleanupAssociatedTmuxSessions, previewAssociatedTmuxSessions } from '#/web/tmux-cleanup-client.ts'
import * as tmuxCleanupClient from '#/web/tmux-cleanup-client.ts'

describe('tmux cleanup client', () => {
  beforeEach(() => mocks.postServerJson.mockReset())

  test('posts preview and execute requests with cancellation', async () => {
    const controller = new AbortController()
    mocks.postServerJson.mockResolvedValue({ ok: true })

    await previewAssociatedTmuxSessions({ projectRoot: '/work/repo', itemPath: '/work/feature' }, controller.signal)
    await cleanupAssociatedTmuxSessions(
      {
        projectRoot: '/work/repo',
        itemPath: '/work/feature',
        approvedSessionNames: ['hobgoblin-v1-0123456789abcdef01234567'],
      },
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
      {
        projectRoot: '/work/repo',
        itemPath: '/work/feature',
        approvedSessionNames: ['hobgoblin-v1-0123456789abcdef01234567'],
      },
      { signal: controller.signal },
    )
  })

  test('posts host preview and exact-origin close requests', async () => {
    const previewHost = (
      tmuxCleanupClient as typeof tmuxCleanupClient & {
        previewHostTmuxSessions?: (input: { projectRoot: string }, signal?: AbortSignal) => Promise<unknown>
      }
    ).previewHostTmuxSessions
    const closeHost = (
      tmuxCleanupClient as typeof tmuxCleanupClient & {
        closeHostTmuxSessions?: (
          input: {
            projectRoot: string
            approvedSessions: Array<{
              kind: 'hobgoblin' | 'default'
              sessionName: string
              serverName?: string
            }>
          },
          signal?: AbortSignal,
        ) => Promise<unknown>
      }
    ).closeHostTmuxSessions
    expect(previewHost).toBeTypeOf('function')
    expect(closeHost).toBeTypeOf('function')
    if (!previewHost || !closeHost) return
    const controller = new AbortController()
    mocks.postServerJson.mockResolvedValue({ ok: true })
    const input = {
      projectRoot: '/work/repo',
      approvedSessions: [
        {
          kind: 'hobgoblin' as const,
          sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
          serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
        },
      ],
    }

    await previewHost({ projectRoot: input.projectRoot }, controller.signal)
    await closeHost(input, controller.signal)

    expect(mocks.postServerJson).toHaveBeenNthCalledWith(
      1,
      '/api/tmux-cleanup/host-preview',
      { projectRoot: '/work/repo' },
      { signal: controller.signal },
    )
    expect(mocks.postServerJson).toHaveBeenNthCalledWith(2, '/api/tmux-cleanup/host-execute', input, {
      signal: controller.signal,
    })
  })

  test('posts one exact Host session identity for external open', async () => {
    const openHost = (
      tmuxCleanupClient as typeof tmuxCleanupClient & {
        openHostTmuxSession?: (
          input: {
            projectRoot: string
            session: { kind: 'default'; sessionName: string }
          },
          signal?: AbortSignal,
        ) => Promise<unknown>
      }
    ).openHostTmuxSession
    expect(openHost).toBeTypeOf('function')
    if (!openHost) return
    const controller = new AbortController()
    mocks.postServerJson.mockResolvedValue({ ok: true, status: 'opened' })
    const input = {
      projectRoot: '/work/repo',
      session: { kind: 'default' as const, sessionName: 'editor work' },
    }

    await openHost(input, controller.signal)

    expect(mocks.postServerJson).toHaveBeenCalledWith('/api/tmux-cleanup/host-open', input, {
      signal: controller.signal,
    })
  })
})
