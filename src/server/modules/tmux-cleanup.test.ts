import { describe, expect, test, vi } from 'vitest'
import * as tmuxCleanupModule from '#/server/modules/tmux-cleanup.ts'
import {
  cleanupAssociatedTmuxSessions,
  closeAssociatedTmuxSessionByName,
  pageAssociatedTmuxSession,
  previewAssociatedTmuxSessions,
  returnAssociatedTmuxSessionToBottom,
  type TmuxCleanupDependencies,
} from '#/server/modules/tmux-cleanup.ts'
import { buildTmuxServerName, buildTmuxSessionName } from '#/system/tmux-session.ts'

const LOCAL_PROJECT_ROOT = '/work/repo'
const LOCAL_SERVER_NAME = buildTmuxServerName(LOCAL_PROJECT_ROOT)!
const LOCAL_PATH = '/work/feature'
const FIRST_NAME = buildTmuxSessionName({
  projectRoot: LOCAL_PROJECT_ROOT,
  workingDirectory: LOCAL_PATH,
  terminalNumber: 1,
})!
const SECOND_NAME = buildTmuxSessionName({
  projectRoot: LOCAL_PROJECT_ROOT,
  workingDirectory: LOCAL_PATH,
  terminalNumber: 2,
})!
const MISSING_NAME = buildTmuxSessionName({
  projectRoot: LOCAL_PROJECT_ROOT,
  workingDirectory: LOCAL_PATH,
  terminalNumber: 3,
})!
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
const REMOTE_SERVER_NAME = buildTmuxServerName(REMOTE_TARGET.remotePath)!
const REMOTE_FIRST_NAME = buildTmuxSessionName({
  projectRoot: REMOTE_TARGET.remotePath,
  workingDirectory: '/srv/feature',
  terminalNumber: 1,
})!

describe('associated tmux cleanup', () => {
  test('closes only the exact current-protocol name at the normalized local path', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionName: FIRST_NAME,
          initialPath: '/work/feature/',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: LOCAL_SERVER_NAME,
        },
        { sessionName: SECOND_NAME, initialPath: '/work/feature', terminalNumber: 2, attachedClients: 0 },
      ],
    }))
    const killLocalByName = vi.fn(async () => ({ ok: true, message: '' }))

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: '/work/repo', itemPath: '/work/feature/.', sessionName: FIRST_NAME },
        { platform: 'linux', listLocal, killLocalByName },
      ),
    ).resolves.toEqual({ ok: true, status: 'closed' })
    expect(listLocal).toHaveBeenCalledWith({ projectRoot: LOCAL_PROJECT_ROOT, signal: undefined })
    expect(killLocalByName).toHaveBeenCalledWith(FIRST_NAME, {
      projectRoot: LOCAL_PROJECT_ROOT,
      serverName: LOCAL_SERVER_NAME,
      signal: undefined,
    })
  })

  test('returns only the exact associated local session to the live pane bottom', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionName: FIRST_NAME,
          initialPath: '/work/feature/',
          terminalNumber: 1,
          attachedClients: 1,
          serverName: LOCAL_SERVER_NAME,
        },
      ],
    }))
    const cancelLocalModeByName = vi.fn(async () => ({ ok: true, message: '' }))

    await expect(
      returnAssociatedTmuxSessionToBottom(
        { projectRoot: LOCAL_PROJECT_ROOT, itemPath: '/work/feature/.', sessionName: FIRST_NAME },
        { platform: 'linux', listLocal, cancelLocalModeByName },
      ),
    ).resolves.toEqual({ ok: true, status: 'returned' })
    expect(cancelLocalModeByName).toHaveBeenCalledWith(FIRST_NAME, {
      projectRoot: LOCAL_PROJECT_ROOT,
      serverName: LOCAL_SERVER_NAME,
      signal: undefined,
    })
  })

  test('returns an exact associated SSH session through its project tmux server', async () => {
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: `/srv/feature\t1\t1\t${REMOTE_FIRST_NAME}\t${REMOTE_SERVER_NAME}`,
        stderr: '',
      })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })

    await expect(
      returnAssociatedTmuxSessionToBottom(
        { projectRoot: REMOTE_REPO, itemPath: '/srv/feature', sessionName: REMOTE_FIRST_NAME },
        dependencies({ resolveRemote, runRemote }),
      ),
    ).resolves.toEqual({ ok: true, status: 'returned' })
    expect(runRemote).toHaveBeenNthCalledWith(
      2,
      REMOTE_TARGET,
      {
        type: 'tmuxCancelModeBySessionName',
        projectRoot: REMOTE_TARGET.remotePath,
        sessionName: REMOTE_FIRST_NAME,
        serverName: REMOTE_SERVER_NAME,
      },
      { signal: undefined },
    )
  })

  test('pages only the exact associated local session in the requested direction', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionName: FIRST_NAME,
          initialPath: '/work/feature/',
          terminalNumber: 1,
          attachedClients: 1,
          serverName: LOCAL_SERVER_NAME,
        },
      ],
    }))
    const pageLocalByName = vi.fn(async () => ({ ok: true, message: '' }))

    await expect(
      pageAssociatedTmuxSession(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          itemPath: '/work/feature/.',
          sessionName: FIRST_NAME,
          direction: 'up',
        },
        { platform: 'linux', listLocal, pageLocalByName },
      ),
    ).resolves.toEqual({ ok: true, status: 'paged' })
    expect(pageLocalByName).toHaveBeenCalledWith(FIRST_NAME, 'up', {
      projectRoot: LOCAL_PROJECT_ROOT,
      serverName: LOCAL_SERVER_NAME,
      signal: undefined,
    })
  })

  test('pages an exact associated SSH session through its project tmux server', async () => {
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: `/srv/feature\t1\t1\t${REMOTE_FIRST_NAME}\t${REMOTE_SERVER_NAME}`,
        stderr: '',
      })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })

    await expect(
      pageAssociatedTmuxSession(
        {
          projectRoot: REMOTE_REPO,
          itemPath: '/srv/feature',
          sessionName: REMOTE_FIRST_NAME,
          direction: 'down',
        },
        dependencies({ resolveRemote, runRemote }),
      ),
    ).resolves.toEqual({ ok: true, status: 'paged' })
    expect(runRemote).toHaveBeenNthCalledWith(
      2,
      REMOTE_TARGET,
      {
        type: 'tmuxPageBySessionName',
        projectRoot: REMOTE_TARGET.remotePath,
        sessionName: REMOTE_FIRST_NAME,
        serverName: REMOTE_SERVER_NAME,
        direction: 'down',
      },
      { signal: undefined },
    )
  })

  test('rejects an invalid tmux page direction before listing sessions', async () => {
    const listLocal = vi.fn()

    await expect(
      pageAssociatedTmuxSession(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          itemPath: LOCAL_PATH,
          sessionName: FIRST_NAME,
          direction: 'sideways' as 'up',
        },
        { platform: 'linux', listLocal },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(listLocal).not.toHaveBeenCalled()
  })

  test('does not close an exact name reported at a different path', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [{ sessionName: FIRST_NAME, initialPath: '/work/other', terminalNumber: 1, attachedClients: 0 }],
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
        sessions: [{ sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 }],
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
      .mockResolvedValueOnce({
        ok: true,
        stdout: `/srv/feature\t1\t0\t${REMOTE_FIRST_NAME}\t${REMOTE_SERVER_NAME}`,
        stderr: '',
      })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })

    await expect(
      closeAssociatedTmuxSessionByName(
        { projectRoot: REMOTE_REPO, itemPath: '/srv/feature', sessionName: REMOTE_FIRST_NAME },
        dependencies({ resolveRemote, runRemote }),
      ),
    ).resolves.toEqual({ ok: true, status: 'closed' })
    expect(runRemote).toHaveBeenNthCalledWith(
      2,
      REMOTE_TARGET,
      {
        type: 'tmuxKillSessionByName',
        projectRoot: REMOTE_TARGET.remotePath,
        sessionName: REMOTE_FIRST_NAME,
        serverName: REMOTE_SERVER_NAME,
      },
      { signal: undefined },
    )
  })

  test('rejects non-protocol names and preserves exact-close command failures', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [{ sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 }],
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

  test('previews only sessions whose path, number, and recomputed name all match', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, initialPath: '/work/feature/', terminalNumber: 1, attachedClients: 0 },
        {
          sessionName: SECOND_NAME,
          initialPath: '/work/feature/nested',
          terminalNumber: 2,
          attachedClients: 0,
        },
        { sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 2, attachedClients: 0 },
        {
          sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
          initialPath: '/work/feature',
          terminalNumber: 1,
          attachedClients: 0,
        },
        { sessionName: 'goblin-feature', initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 },
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
      sessions: [{ sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 }],
    })
  })

  test('prefers a valid project-scoped session over a same-named legacy session', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
          serverName: LOCAL_SERVER_NAME,
        },
        { sessionName: FIRST_NAME, initialPath: LOCAL_PATH, terminalNumber: 1, attachedClients: 0 },
      ],
    }))

    await expect(
      previewAssociatedTmuxSessions(
        { projectRoot: LOCAL_PROJECT_ROOT, itemPath: LOCAL_PATH },
        { platform: 'linux', listLocal },
      ),
    ).resolves.toEqual({
      ok: true,
      targetPath: LOCAL_PATH,
      sessions: [
        {
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
          serverName: LOCAL_SERVER_NAME,
        },
      ],
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
      stdout: `/srv/feature\t1\t0\t${REMOTE_FIRST_NAME}\t${REMOTE_SERVER_NAME}`,
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
      sessions: [
        {
          sessionName: REMOTE_FIRST_NAME,
          initialPath: '/srv/feature',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: REMOTE_SERVER_NAME,
        },
      ],
    })
    expect(runRemote).toHaveBeenCalledWith(
      REMOTE_TARGET,
      { type: 'tmuxListSessions', projectRoot: REMOTE_TARGET.remotePath },
      { signal: undefined },
    )
  })

  test('re-lists and deletes only approved sessions, ignoring sessions created after preview', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 },
        { sessionName: SECOND_NAME, initialPath: '/work/feature', terminalNumber: 2, attachedClients: 0 },
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
      deleted: [{ sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 }],
      missingSessionNames: [],
      failed: [],
    })
    expect(killLocalByName).toHaveBeenCalledTimes(1)
    expect(killLocalByName).toHaveBeenCalledWith(FIRST_NAME, {
      projectRoot: LOCAL_PROJECT_ROOT,
      serverName: undefined,
      signal: undefined,
    })
  })

  test('reports disappeared and failed sessions without rolling back successful deletions', async () => {
    const listLocal = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        { sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 },
        { sessionName: SECOND_NAME, initialPath: '/work/feature', terminalNumber: 2, attachedClients: 0 },
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
      deleted: [{ sessionName: FIRST_NAME, initialPath: '/work/feature', terminalNumber: 1, attachedClients: 0 }],
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

describe('host tmux session inventory', () => {
  const OTHER_PROJECT_ROOT = '/other/repo'
  const OTHER_PATH = '/other/worktree'
  const OTHER_SERVER_NAME = buildTmuxServerName(OTHER_PROJECT_ROOT)!
  const OTHER_NAME = buildTmuxSessionName({
    projectRoot: OTHER_PROJECT_ROOT,
    workingDirectory: OTHER_PATH,
    terminalNumber: 3,
  })!

  type HostDependencies = Record<string, unknown>
  const hostFunctions = () => {
    const module = tmuxCleanupModule as typeof tmuxCleanupModule & {
      previewHostTmuxSessions?: (
        input: { projectRoot: string },
        dependencies?: HostDependencies,
        signal?: AbortSignal,
      ) => Promise<unknown>
      closeHostTmuxSessions?: (
        input: {
          projectRoot: string
          approvedSessions: Array<
            { kind: 'hobgoblin'; sessionName: string; serverName?: string } | { kind: 'default'; sessionName: string }
          >
        },
        dependencies?: HostDependencies,
        signal?: AbortSignal,
      ) => Promise<unknown>
      openHostTmuxSession?: (
        input: {
          projectRoot: string
          session:
            | { kind: 'hobgoblin'; sessionName: string; serverName?: string }
            | { kind: 'default'; sessionName: string }
        },
        dependencies?: HostDependencies,
        signal?: AbortSignal,
      ) => Promise<unknown>
    }
    expect(module.previewHostTmuxSessions).toBeTypeOf('function')
    expect(module.closeHostTmuxSessions).toBeTypeOf('function')
    return module
  }

  test('previews Android-compatible sessions without project roots and keeps distinct server origins', async () => {
    const module = hostFunctions()
    if (!module.previewHostTmuxSessions) return
    const listLocalHost = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          kind: 'hobgoblin' as const,
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
        },
        {
          kind: 'hobgoblin' as const,
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 2,
          serverName: LOCAL_SERVER_NAME,
        },
        {
          kind: 'hobgoblin' as const,
          sessionName: OTHER_NAME,
          initialPath: OTHER_PATH,
          terminalNumber: 3,
          attachedClients: 1,
          serverName: OTHER_SERVER_NAME,
        },
        {
          kind: 'hobgoblin' as const,
          sessionName: SECOND_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 2,
          attachedClients: 0,
          serverName: OTHER_SERVER_NAME,
        },
        {
          sessionName: 'user-session',
          initialPath: LOCAL_PATH,
          terminalNumber: 9,
          attachedClients: 0,
        },
      ],
    }))

    await expect(
      module.previewHostTmuxSessions({ projectRoot: LOCAL_PROJECT_ROOT }, { platform: 'linux', listLocalHost }),
    ).resolves.toEqual({
      ok: true,
      sessions: [
        {
          kind: 'hobgoblin',
          sessionName: OTHER_NAME,
          initialPath: OTHER_PATH,
          terminalNumber: 3,
          attachedClients: 1,
          serverName: OTHER_SERVER_NAME,
        },
        {
          kind: 'hobgoblin',
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
        },
        {
          kind: 'hobgoblin',
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 2,
          serverName: LOCAL_SERVER_NAME,
        },
        {
          kind: 'hobgoblin',
          sessionName: SECOND_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 2,
          attachedClients: 0,
          serverName: OTHER_SERVER_NAME,
        },
      ],
    })
    expect(listLocalHost).toHaveBeenCalledWith({ signal: undefined })
  })

  test('previews and revalidates safe ordinary sessions only on the default server', async () => {
    const module = hostFunctions()
    if (!module.previewHostTmuxSessions || !module.closeHostTmuxSessions) return
    const ordinarySession = {
      kind: 'default' as const,
      sessionName: "editor's work",
      initialPath: '/srv/editor',
      attachedClients: 1,
    }
    const listLocalHost = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        ordinarySession,
        {
          ...ordinarySession,
          sessionName: 'foreign',
          serverName: LOCAL_SERVER_NAME,
        },
      ],
    }))
    const killLocalHostByName = vi.fn(async () => ({ ok: true as const, message: '' }))

    await expect(
      module.previewHostTmuxSessions({ projectRoot: LOCAL_PROJECT_ROOT }, { platform: 'linux', listLocalHost }),
    ).resolves.toEqual({ ok: true, sessions: [ordinarySession] })
    await expect(
      module.closeHostTmuxSessions(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          approvedSessions: [{ kind: 'default', sessionName: ordinarySession.sessionName }],
        },
        { platform: 'linux', listLocalHost, killLocalHostByName },
      ),
    ).resolves.toEqual({ ok: true, closed: [ordinarySession], missing: [], failed: [] })
    expect(killLocalHostByName).toHaveBeenCalledWith(ordinarySession.sessionName, {
      serverName: undefined,
      signal: undefined,
    })
  })

  test('does not let a changed default-server session kind inherit close approval', async () => {
    const module = hostFunctions()
    if (!module.closeHostTmuxSessions) return
    const listLocalHost = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          kind: 'default' as const,
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          attachedClients: 0,
        },
      ],
    }))
    const killLocalHostByName = vi.fn()
    const approved = { kind: 'hobgoblin' as const, sessionName: FIRST_NAME }

    await expect(
      module.closeHostTmuxSessions(
        { projectRoot: LOCAL_PROJECT_ROOT, approvedSessions: [approved] },
        { platform: 'linux', listLocalHost, killLocalHostByName },
      ),
    ).resolves.toEqual({ ok: true, closed: [], missing: [approved], failed: [] })
    expect(killLocalHostByName).not.toHaveBeenCalled()
  })

  test('revalidates and opens an ordinary local session in the preferred external terminal', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const ordinarySession = {
      kind: 'default' as const,
      sessionName: 'editor work',
      initialPath: '/deleted/editor-worktree',
      attachedClients: 0,
    }
    const listLocalHost = vi.fn(async () => ({ ok: true as const, sessions: [ordinarySession] }))
    const getSettingsPrefs = vi.fn(async () => ({ terminalApp: 'ghostty' }))
    const openLocalTerminal = vi.fn(async () => ({ ok: true as const, message: ordinarySession.initialPath }))

    await expect(
      module.openHostTmuxSession(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          session: { kind: 'default', sessionName: ordinarySession.sessionName },
        },
        { platform: 'linux', listLocalHost, getSettingsPrefs, openLocalTerminal },
      ),
    ).resolves.toEqual({ ok: true, status: 'opened' })
    expect(openLocalTerminal).toHaveBeenCalledWith(
      {
        projectRoot: LOCAL_PROJECT_ROOT,
        workingDirectory: ordinarySession.initialPath,
        terminalNumber: 1,
      },
      'ghostty',
      {
        useTmux: true,
        existingTmuxSessionKind: 'default',
        existingTmuxSessionName: ordinarySession.sessionName,
      },
    )
  })

  test('returns missing without opening when the scanned session kind changed', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const listLocalHost = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          kind: 'default' as const,
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          attachedClients: 0,
        },
      ],
    }))
    const openLocalTerminal = vi.fn()

    await expect(
      module.openHostTmuxSession(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          session: { kind: 'hobgoblin', sessionName: FIRST_NAME },
        },
        { platform: 'linux', listLocalHost, openLocalTerminal },
      ),
    ).resolves.toEqual({ ok: true, status: 'missing' })
    expect(openLocalTerminal).not.toHaveBeenCalled()
  })

  test('returns missing without terminal setup when the exact name, origin, or session changed', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const approved = { kind: 'hobgoblin' as const, sessionName: FIRST_NAME, serverName: LOCAL_SERVER_NAME }
    const scenarios = [
      {
        sessions: [
          {
            kind: 'hobgoblin' as const,
            sessionName: FIRST_NAME,
            initialPath: LOCAL_PATH,
            terminalNumber: 1,
            attachedClients: 0,
          },
        ],
      },
      {
        sessions: [
          {
            kind: 'hobgoblin' as const,
            sessionName: SECOND_NAME,
            initialPath: LOCAL_PATH,
            terminalNumber: 2,
            attachedClients: 0,
            serverName: LOCAL_SERVER_NAME,
          },
        ],
      },
      { sessions: [] },
    ]

    for (const scenario of scenarios) {
      const listLocalHost = vi.fn(async () => ({ ok: true as const, sessions: scenario.sessions }))
      const getSettingsPrefs = vi.fn()
      const openLocalTerminal = vi.fn()

      await expect(
        module.openHostTmuxSession(
          { projectRoot: LOCAL_PROJECT_ROOT, session: approved },
          { platform: 'linux', listLocalHost, getSettingsPrefs, openLocalTerminal },
        ),
      ).resolves.toEqual({ ok: true, status: 'missing' })
      expect(getSettingsPrefs).not.toHaveBeenCalled()
      expect(openLocalTerminal).not.toHaveBeenCalled()
    }
  })

  test('opens a default-server Hobgoblin session locally without inventing a named origin', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const session = {
      kind: 'hobgoblin' as const,
      sessionName: FIRST_NAME,
      initialPath: LOCAL_PATH,
      terminalNumber: 1,
      attachedClients: 0,
    }
    const listLocalHost = vi.fn(async () => ({ ok: true as const, sessions: [session] }))
    const getSettingsPrefs = vi.fn(async () => ({ terminalApp: 'ghostty' }))
    const openLocalTerminal = vi.fn(async () => ({ ok: true as const, message: LOCAL_PATH }))

    await expect(
      module.openHostTmuxSession(
        { projectRoot: LOCAL_PROJECT_ROOT, session: { kind: 'hobgoblin', sessionName: FIRST_NAME } },
        { platform: 'linux', listLocalHost, getSettingsPrefs, openLocalTerminal },
      ),
    ).resolves.toEqual({ ok: true, status: 'opened' })
    expect(openLocalTerminal).toHaveBeenCalledWith(
      { projectRoot: LOCAL_PROJECT_ROOT, workingDirectory: LOCAL_PATH, terminalNumber: 1 },
      'ghostty',
      {
        useTmux: true,
        existingTmuxSessionKind: 'hobgoblin',
        existingTmuxSessionName: FIRST_NAME,
      },
    )
  })

  test('revalidates and opens a named Host session through the selected SSH locator', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi.fn(async () => ({
      ok: true as const,
      stdout: `/srv/orphan\t1\t0\t${REMOTE_FIRST_NAME}\t/srv/orphan\t${REMOTE_SERVER_NAME}`,
      stderr: '',
    }))
    const getSettingsPrefs = vi.fn(async () => ({ terminalApp: 'terminal' }))
    const openRemoteTerminal = vi.fn(async () => ({ ok: true as const, message: '/srv/orphan' }))

    await expect(
      module.openHostTmuxSession(
        {
          projectRoot: REMOTE_REPO,
          session: { kind: 'hobgoblin', sessionName: REMOTE_FIRST_NAME, serverName: REMOTE_SERVER_NAME },
        },
        { platform: 'linux', resolveRemote, runRemote, getSettingsPrefs, openRemoteTerminal },
      ),
    ).resolves.toEqual({ ok: true, status: 'opened' })
    expect(openRemoteTerminal).toHaveBeenCalledWith(
      {
        alias: REMOTE_TARGET.alias,
        projectRoot: REMOTE_TARGET.remotePath,
        workingDirectory: '/srv/orphan',
        terminalNumber: 1,
      },
      'terminal',
      {
        useTmux: true,
        existingTmuxSessionKind: 'hobgoblin',
        existingTmuxSessionName: REMOTE_FIRST_NAME,
        existingTmuxServerName: REMOTE_SERVER_NAME,
      },
    )
  })

  test('opens a default-server Hobgoblin session through SSH without inventing a named origin', async () => {
    const module = hostFunctions()
    expect(module.openHostTmuxSession).toBeTypeOf('function')
    if (!module.openHostTmuxSession) return
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi.fn(async () => ({
      ok: true as const,
      stdout: `/srv/feature\t1\t0\t${REMOTE_FIRST_NAME}\t/srv/feature\tlegacy-default`,
      stderr: '',
    }))
    const getSettingsPrefs = vi.fn(async () => ({ terminalApp: 'terminal' }))
    const openRemoteTerminal = vi.fn(async () => ({ ok: true as const, message: '/srv/feature' }))

    await expect(
      module.openHostTmuxSession(
        { projectRoot: REMOTE_REPO, session: { kind: 'hobgoblin', sessionName: REMOTE_FIRST_NAME } },
        { platform: 'linux', resolveRemote, runRemote, getSettingsPrefs, openRemoteTerminal },
      ),
    ).resolves.toEqual({ ok: true, status: 'opened' })
    expect(openRemoteTerminal).toHaveBeenCalledWith(
      {
        alias: REMOTE_TARGET.alias,
        projectRoot: REMOTE_TARGET.remotePath,
        workingDirectory: '/srv/feature',
        terminalNumber: 1,
      },
      'terminal',
      {
        useTmux: true,
        existingTmuxSessionKind: 'hobgoblin',
        existingTmuxSessionName: REMOTE_FIRST_NAME,
      },
    )
  })

  test('revalidates exact name and origin approvals before sequential close', async () => {
    const module = hostFunctions()
    if (!module.closeHostTmuxSessions) return
    const listLocalHost = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          kind: 'hobgoblin' as const,
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
          serverName: LOCAL_SERVER_NAME,
        },
        {
          kind: 'hobgoblin' as const,
          sessionName: SECOND_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 2,
          attachedClients: 0,
        },
        {
          kind: 'hobgoblin' as const,
          sessionName: OTHER_NAME,
          initialPath: OTHER_PATH,
          terminalNumber: 3,
          attachedClients: 0,
          serverName: OTHER_SERVER_NAME,
        },
      ],
    }))
    const killLocalHostByName = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, message: '' })
      .mockResolvedValueOnce({ ok: false, message: 'permission denied' })
    const missing = { kind: 'hobgoblin' as const, sessionName: MISSING_NAME, serverName: LOCAL_SERVER_NAME }

    await expect(
      module.closeHostTmuxSessions(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          approvedSessions: [
            { kind: 'hobgoblin', sessionName: FIRST_NAME, serverName: LOCAL_SERVER_NAME },
            missing,
            { kind: 'hobgoblin', sessionName: SECOND_NAME },
          ],
        },
        { platform: 'linux', listLocalHost, killLocalHostByName },
      ),
    ).resolves.toEqual({
      ok: true,
      closed: [
        {
          kind: 'hobgoblin',
          sessionName: FIRST_NAME,
          initialPath: LOCAL_PATH,
          terminalNumber: 1,
          attachedClients: 0,
          serverName: LOCAL_SERVER_NAME,
        },
      ],
      missing: [missing],
      failed: [
        {
          session: {
            kind: 'hobgoblin',
            sessionName: SECOND_NAME,
            initialPath: LOCAL_PATH,
            terminalNumber: 2,
            attachedClients: 0,
          },
          message: 'permission denied',
        },
      ],
    })
    expect(killLocalHostByName.mock.calls).toEqual([
      [FIRST_NAME, { serverName: LOCAL_SERVER_NAME, signal: undefined }],
      [SECOND_NAME, { serverName: undefined, signal: undefined }],
    ])
  })

  test('lists and closes host sessions through the selected SSH host locator', async () => {
    const module = hostFunctions()
    if (!module.previewHostTmuxSessions || !module.closeHostTmuxSessions) return
    const resolveRemote = vi.fn(async () => REMOTE_TARGET)
    const runRemote = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout: `/srv/feature\t1\t0\t${REMOTE_FIRST_NAME}\t/srv/feature\t${REMOTE_SERVER_NAME}`,
        stderr: '',
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: `/srv/feature\t1\t0\t${REMOTE_FIRST_NAME}\t/srv/feature\t${REMOTE_SERVER_NAME}`,
        stderr: '',
      })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })
    const hostDependencies = { platform: 'linux', resolveRemote, runRemote }

    await expect(module.previewHostTmuxSessions({ projectRoot: REMOTE_REPO }, hostDependencies)).resolves.toEqual({
      ok: true,
      sessions: [
        {
          kind: 'hobgoblin',
          sessionName: REMOTE_FIRST_NAME,
          initialPath: '/srv/feature',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: REMOTE_SERVER_NAME,
        },
      ],
    })
    await expect(
      module.closeHostTmuxSessions(
        {
          projectRoot: REMOTE_REPO,
          approvedSessions: [{ kind: 'hobgoblin', sessionName: REMOTE_FIRST_NAME, serverName: REMOTE_SERVER_NAME }],
        },
        hostDependencies,
      ),
    ).resolves.toMatchObject({ ok: true, missing: [], failed: [] })
    expect(runRemote).toHaveBeenNthCalledWith(1, REMOTE_TARGET, { type: 'tmuxListHostSessions' }, { signal: undefined })
    expect(runRemote).toHaveBeenNthCalledWith(
      3,
      REMOTE_TARGET,
      {
        type: 'tmuxKillHostSessionByName',
        sessionName: REMOTE_FIRST_NAME,
        serverName: REMOTE_SERVER_NAME,
      },
      { signal: undefined },
    )
  })

  test('rejects local Windows and malformed or empty approvals without touching tmux', async () => {
    const module = hostFunctions()
    if (!module.previewHostTmuxSessions || !module.closeHostTmuxSessions) return
    const listLocalHost = vi.fn()

    await expect(
      module.previewHostTmuxSessions({ projectRoot: 'C:\\repo' }, { platform: 'win32', listLocalHost }),
    ).resolves.toEqual({ ok: false, message: 'error.tmux-unsupported' })
    await expect(
      module.closeHostTmuxSessions(
        { projectRoot: LOCAL_PROJECT_ROOT, approvedSessions: [] },
        { platform: 'linux', listLocalHost },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(
      module.closeHostTmuxSessions(
        {
          projectRoot: LOCAL_PROJECT_ROOT,
          approvedSessions: [{ kind: 'hobgoblin', sessionName: FIRST_NAME, serverName: 'user-server' }],
        },
        { platform: 'linux', listLocalHost },
      ),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(listLocalHost).not.toHaveBeenCalled()
  })
})
