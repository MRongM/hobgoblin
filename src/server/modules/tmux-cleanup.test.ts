import { describe, expect, test, vi } from 'vitest'
import {
  cleanupAssociatedTmuxSessions,
  closeAssociatedTmuxSessionByName,
  previewAssociatedTmuxSessions,
  type TmuxCleanupDependencies,
} from '#/server/modules/tmux-cleanup.ts'

const FIRST_NAME = 'hobgoblin-v1-0123456789abcdef01234567'
const SECOND_NAME = 'hobgoblin-v1-89abcdef0123456789abcdef'
const MISSING_NAME = 'hobgoblin-v1-fedcba9876543210fedcba98'
const REMOTE_REPO = 'ssh-config://prod/srv/repo'
const REMOTE_TARGET = {
  id: REMOTE_REPO,
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/repo',
  displayName: 'prod:repo',
}

describe('associated tmux cleanup', () => {
  test('closes only the exact current-protocol name at the normalized local path', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, sessionPath: '/work/feature/' },
        { sessionName: SECOND_NAME, sessionPath: '/work/feature' },
      ],
    }))
    const killLocalByName = vi.fn(async () => ({ ok: true, message: '' }))

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: '/work/repo', itemPath: '/work/feature/.', sessionName: FIRST_NAME },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: true, status: 'closed' })
    expect(killLocalByName).toHaveBeenCalledWith(FIRST_NAME, { signal: undefined })
  })

  test('does not close an exact name reported at a different path', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [{ sessionName: FIRST_NAME, sessionPath: '/work/other' }],
    }))
    const killLocalByName = vi.fn()

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: '/work/repo', itemPath: '/work/feature', sessionName: FIRST_NAME },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: true, status: 'missing' })
    expect(killLocalByName).not.toHaveBeenCalled()
  })

  test('treats an absent or concurrently disappeared exact session as missing', async () => {
    const listLocal = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, sessions: [] })
      .mockResolvedValueOnce({
        ok: true,
        sessions: [{ sessionName: FIRST_NAME, sessionPath: '/work/feature' }],
      })
    const killLocalByName = vi.fn(async () => ({ ok: false, message: `can't find session: ${FIRST_NAME}` }))
    const dependenciesWithExactKill = { platform: 'linux' as const, listLocal, killLocalByName }
    const input = { projectRoot: '/work/repo', itemPath: '/work/feature', sessionName: FIRST_NAME }

    await expect(closeAssociatedTmuxSessionByName(input, dependenciesWithExactKill)).resolves.toEqual({
      ok: true,
      status: 'missing',
    })
    await expect(closeAssociatedTmuxSessionByName(input, dependenciesWithExactKill)).resolves.toEqual({
      ok: true,
      status: 'missing',
    })
  })

  test('closes the exact session through the resolved SSH target', async () => {
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, stdout: `${FIRST_NAME}\t/srv/feature`, stderr: '' })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: REMOTE_REPO, itemPath: '/srv/feature', sessionName: FIRST_NAME },
        dependencies({ resolveRemote, runRemote }),
      ),
    ).resolves.toEqual({ ok: true, status: 'closed' })
    expect(runRemote).toHaveBeenNthCalledWith(
      2,
      REMOTE_TARGET,
      { type: 'tmuxKillSessionByName', sessionName: FIRST_NAME },
      { signal: undefined },
    )
  })

  test('rejects non-protocol names and preserves exact-close command failures', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [{ sessionName: FIRST_NAME, sessionPath: '/work/feature' }],
    }))
    const killLocalByName = vi.fn(async () => ({ ok: false, message: 'permission denied' }))

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: '/work/repo', itemPath: '/work/feature', sessionName: 'goblin-feature' },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: '/work/repo', itemPath: '/work/feature', sessionName: FIRST_NAME },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: false, message: 'permission denied' })
    expect(killLocalByName).toHaveBeenCalledTimes(1)
  })

  test('previews only current-protocol sessions whose normalized path is an exact match', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, sessionPath: '/work/feature/' },
        { sessionName: SECOND_NAME, sessionPath: '/work/feature/nested' },
        { sessionName: 'goblin-feature', sessionPath: '/work/feature' },
      ],
    }))

    await expect(
      previewAssociatedTmuxSessions(
        { projectRoot: '/work/repo', itemPath: '/work/feature/.' },
        { platform: 'darwin', listLocal },
      ),
    ).resolves.toEqual({
      ok: true,
      targetPath: '/work/feature',
      sessions: [{ sessionName: FIRST_NAME, sessionPath: '/work/feature' }],
    })
  })

  test('rejects local Windows without probing tmux', async () => {
    const listLocal = vi.fn()

    await expect(
      previewAssociatedTmuxSessions(
        { projectRoot: 'C:\\repo', itemPath: 'C:\\repo' },
        { platform: 'win32', listLocal },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.tmux-unsupported' })
    expect(listLocal).not.toHaveBeenCalled()
  })

  test('lists sessions through the resolved SSH target', async () => {
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi.fn(async () => ({
      ok: true,
      stdout: `${FIRST_NAME}\t/srv/feature`,
      stderr: '',
    }))

    await expect(
      previewAssociatedTmuxSessions(
        { projectRoot: REMOTE_REPO, itemPath: '/srv/feature' },
        dependencies({ resolveRemote, runRemote }),
      ),
    ).resolves.toEqual({
      ok: true,
      targetPath: '/srv/feature',
      sessions: [{ sessionName: FIRST_NAME, sessionPath: '/srv/feature' }],
    })
    expect(runRemote).toHaveBeenCalledWith(REMOTE_TARGET, { type: 'tmuxListSessions' }, { signal: undefined })
  })

  test('re-lists and deletes only approved sessions, ignoring sessions created after preview', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, sessionPath: '/work/feature' },
        { sessionName: SECOND_NAME, sessionPath: '/work/feature' },
      ],
    }))
    const killLocalByName = vi.fn(async () => ({ ok: true, message: '' }))

    await expect(
      cleanupAssociatedTmuxSessions(
        { projectRoot: '/work/repo', itemPath: '/work/feature', approvedSessionNames: [FIRST_NAME] },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({
      ok: true,
      targetPath: '/work/feature',
      deleted: [{ sessionName: FIRST_NAME, sessionPath: '/work/feature' }],
      missingSessionNames: [],
      failed: [],
    })
    expect(killLocalByName).toHaveBeenCalledTimes(1)
    expect(killLocalByName).toHaveBeenCalledWith(FIRST_NAME, { signal: undefined })
  })

  test('reports disappeared and failed sessions without rolling back successful deletions', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, sessionPath: '/work/feature' },
        { sessionName: SECOND_NAME, sessionPath: '/work/feature' },
      ],
    }))
    const killLocalByName = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: '' })
      .mockResolvedValueOnce({ ok: false, message: 'permission denied' })

    await expect(
      cleanupAssociatedTmuxSessions(
        {
          projectRoot: '/work/repo',
          itemPath: '/work/feature',
          approvedSessionNames: [FIRST_NAME, MISSING_NAME, SECOND_NAME],
        },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({
      ok: true,
      targetPath: '/work/feature',
      deleted: [{ sessionName: FIRST_NAME, sessionPath: '/work/feature' }],
      missingSessionNames: [MISSING_NAME],
      failed: [{ sessionName: SECOND_NAME, message: 'permission denied' }],
    })
  })

  test('rejects malformed targets and session names before invoking dependencies', async () => {
    const listLocal = vi.fn()
    const killLocalByName = vi.fn()

    await expect(
      cleanupAssociatedTmuxSessions(
        { projectRoot: '/work/repo', itemPath: 'relative', approvedSessionNames: [FIRST_NAME] },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      cleanupAssociatedTmuxSessions(
        { projectRoot: '/work/repo', itemPath: '/work/feature', approvedSessionNames: ['goblin-feature'] },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(listLocal).not.toHaveBeenCalled()
    expect(killLocalByName).not.toHaveBeenCalled()
  })
})

function dependencies(overrides: Partial<TmuxCleanupDependencies> = {}): TmuxCleanupDependencies {
  return {
    platform: 'linux',
    listLocal: vi.fn(),
    killLocalByName: vi.fn(),
    resolveRemote: vi.fn(),
    runRemote: vi.fn(),
    ...overrides,
  }
}
