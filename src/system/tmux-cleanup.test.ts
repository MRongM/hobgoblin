import { describe, expect, test, vi } from 'vitest'
import * as tmuxCleanup from '#/system/tmux-cleanup.ts'
import {
  isTmuxSessionMissingMessage,
  killLocalTmuxSessionByName,
  listLocalTmuxSessions,
  parseTmuxSessionList,
  TMUX_SESSION_LIST_FORMAT,
  type TmuxProcessRunner,
} from '#/system/tmux-cleanup.ts'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
}))
const PROJECT_ROOT = '/srv/projects/example'
const PROJECT_SERVER_NAME = 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0'

vi.mock('execa', () => ({
  execa: mocks.execa,
}))

describe('parseTmuxSessionList', () => {
  test('parses validated project and legacy server origins from a combined remote list', () => {
    expect(
      parseTmuxSessionList(
        [
          `/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020\t${PROJECT_SERVER_NAME}`,
          '/srv/repo\t2\t0\thobgoblin-v1-0123456789abcdef01234567\tlegacy-default',
        ].join('\n'),
        PROJECT_ROOT,
      ),
    ).toEqual([
      {
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        initialPath: '/srv/repo',
        terminalNumber: 1,
        attachedClients: 0,
        serverName: PROJECT_SERVER_NAME,
      },
      {
        sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
        initialPath: '/srv/repo',
        terminalNumber: 2,
        attachedClients: 0,
      },
    ])
    expect(
      parseTmuxSessionList(
        '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020\thobgoblin-project-v1-0123456789abcdef01234567',
        PROJECT_ROOT,
      ),
    ).toBeNull()
  })

  test('parses identity metadata and the attached-client count', () => {
    expect(
      parseTmuxSessionList(
        ['/srv/repo,feature\t1\t0\thobgoblin-v1-aebf050981ac829e36100020', '\t\t1\tuser-session'].join('\n'),
      ),
    ).toEqual([
      {
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        initialPath: '/srv/repo,feature',
        terminalNumber: 1,
        attachedClients: 0,
      },
    ])
  })

  test('skips sessions with missing or corrupt identity metadata', () => {
    expect(
      parseTmuxSessionList(
        [
          '\t\t0\thobgoblin-v1-aebf050981ac829e36100020',
          '/srv/repo\tnot-a-number\t0\thobgoblin-v1-0123456789abcdef01234567',
          '/srv/repo\t0\t0\thobgoblin-v1-89abcdef0123456789abcdef',
          '/srv/repo\t1\tnot-a-number\thobgoblin-v1-aebf050981ac829e36100020',
          '/srv/repo\t1\t-1\thobgoblin-v1-aebf050981ac829e36100020',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  test('returns null instead of guessing malformed field boundaries', () => {
    expect(parseTmuxSessionList('missing-fields')).toBeNull()
    expect(parseTmuxSessionList('/srv/repo\t1\t0\tname\textra')).toBeNull()
    expect(parseTmuxSessionList('relative/path\t1\t0\tname')).toEqual([])
  })

  test('accepts empty output as an empty session list', () => {
    expect(parseTmuxSessionList('')).toEqual([])
  })
})

describe('local tmux commands', () => {
  test('lists the project server before the legacy default server and keeps the exact origin', async () => {
    const run = vi
      .fn<TmuxProcessRunner>()
      .mockResolvedValueOnce({
        ok: true,
        stdout: '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: '/srv/repo\t2\t0\thobgoblin-v1-0123456789abcdef01234567',
        stderr: '',
      })

    await expect(listLocalTmuxSessions({ projectRoot: '/srv/projects/example', run })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0',
        },
        {
          sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
          initialPath: '/srv/repo',
          terminalNumber: 2,
          attachedClients: 0,
        },
      ],
    })
    expect(run).toHaveBeenNthCalledWith(
      1,
      ['-L', 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0', '-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      undefined,
    )
    expect(run).toHaveBeenNthCalledWith(2, ['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT], undefined)
  })

  test('refreshes a cached executable once when its session list becomes malformed', async () => {
    vi.resetModules()
    mocks.execa.mockReset()
    mocks.execa
      .mockResolvedValueOnce({ failed: true, code: 'ENOENT', stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '/opt/tools/tmux-v1\n', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'unsupported output', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '/opt/tools/tmux-v2\n', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
    const { listLocalTmuxSessions: listSessions } = await import('#/system/tmux-cleanup.ts')

    await expect(listSessions({ projectRoot: PROJECT_ROOT })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: PROJECT_SERVER_NAME,
        },
      ],
    })
    await expect(listSessions({ projectRoot: PROJECT_ROOT })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: PROJECT_SERVER_NAME,
        },
      ],
    })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      6,
      expect.stringMatching(/^\//u),
      ['-lc', 'command -v tmux'],
      expect.objectContaining({ reject: false }),
    )
    expect(mocks.execa).toHaveBeenNthCalledWith(
      7,
      '/opt/tools/tmux-v2',
      ['-L', PROJECT_SERVER_NAME, '-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      expect.objectContaining({ reject: false }),
    )
  })

  test('resolves tmux through the login shell and reuses it when the GUI PATH cannot find it', async () => {
    mocks.execa
      .mockResolvedValueOnce({
        failed: true,
        code: 'ENOENT',
        stdout: '',
        stderr: '',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/opt/homebrew/bin/tmux\n',
        stderr: '',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    await expect(listLocalTmuxSessions({ projectRoot: PROJECT_ROOT })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: PROJECT_SERVER_NAME,
        },
      ],
    })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^\//u),
      ['-lc', 'command -v tmux'],
      expect.objectContaining({ reject: false }),
    )
    expect(mocks.execa).toHaveBeenNthCalledWith(
      3,
      '/opt/homebrew/bin/tmux',
      ['-L', PROJECT_SERVER_NAME, '-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      expect.objectContaining({ reject: false }),
    )
    await expect(
      killLocalTmuxSessionByName('hobgoblin-v1-aebf050981ac829e36100020', {
        projectRoot: PROJECT_ROOT,
        serverName: PROJECT_SERVER_NAME,
      }),
    ).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      5,
      '/opt/homebrew/bin/tmux',
      ['-L', PROJECT_SERVER_NAME, 'kill-session', '-t', '=hobgoblin-v1-aebf050981ac829e36100020'],
      expect.objectContaining({ reject: false }),
    )
  })

  test('forces UTF-8 when listing sessions so the protocol delimiter survives a missing locale', async () => {
    const run = vi
      .fn<TmuxProcessRunner>()
      .mockResolvedValueOnce({
        ok: true,
        stdout: '/srv/repo\t1\t0\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ ok: true, stdout: '', stderr: '' })

    await expect(listLocalTmuxSessions({ projectRoot: PROJECT_ROOT, run })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: PROJECT_SERVER_NAME,
        },
      ],
    })
    expect(run).toHaveBeenNthCalledWith(
      1,
      ['-L', PROJECT_SERVER_NAME, '-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      undefined,
    )
    expect(run).toHaveBeenNthCalledWith(2, ['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT], undefined)
  })

  test('treats an installed tmux with no server as an empty list', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({
      ok: false,
      stdout: '',
      stderr: 'no server running on /tmp/tmux-501/default',
      message: 'no server running on /tmp/tmux-501/default',
    }))

    await expect(listLocalTmuxSessions({ projectRoot: PROJECT_ROOT, run })).resolves.toEqual({
      ok: true,
      sessions: [],
    })
  })

  test('preserves unavailable and malformed-output failures', async () => {
    const unavailable = vi.fn<TmuxProcessRunner>(async () => ({
      ok: false,
      stdout: '',
      stderr: '',
      message: 'error.tmux-unavailable',
    }))
    const malformed = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: 'bad\trow', stderr: '' }))

    await expect(listLocalTmuxSessions({ projectRoot: PROJECT_ROOT, run: unavailable })).resolves.toEqual({
      ok: false,
      message: 'error.tmux-unavailable',
    })
    await expect(listLocalTmuxSessions({ projectRoot: PROJECT_ROOT, run: malformed })).resolves.toEqual({
      ok: false,
      message: 'error.tmux-invalid-output',
    })
  })

  test('kills an exact current-protocol session name and rejects other names', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: '', stderr: '' }))
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'

    await expect(
      killLocalTmuxSessionByName(sessionName, {
        projectRoot: PROJECT_ROOT,
        serverName: PROJECT_SERVER_NAME,
        run,
      }),
    ).resolves.toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(['-L', PROJECT_SERVER_NAME, 'kill-session', '-t', `=${sessionName}`], undefined)

    await expect(killLocalTmuxSessionByName('goblin-feature', { projectRoot: PROJECT_ROOT, run })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    await expect(
      killLocalTmuxSessionByName(sessionName, {
        projectRoot: PROJECT_ROOT,
        serverName: 'hobgoblin-project-v1-0123456789abcdef01234567',
        run,
      }),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('recognizes tmux responses that mean an exact session is already missing', () => {
    expect(isTmuxSessionMissingMessage("can't find session: hobgoblin-v1-example")).toBe(true)
    expect(isTmuxSessionMissingMessage('no server running on /tmp/tmux-501/default')).toBe(true)
    expect(isTmuxSessionMissingMessage('permission denied')).toBe(false)
  })
})

describe('local host tmux inventory', () => {
  test('parses self-describing rows with an exact project or legacy server origin', () => {
    const parseHostList = (
      tmuxCleanup as typeof tmuxCleanup & {
        parseTmuxHostSessionList?: (output: string) => unknown
      }
    ).parseTmuxHostSessionList
    expect(parseHostList).toBeTypeOf('function')
    if (!parseHostList) return

    expect(
      parseHostList(
        [
          `/srv/projects/example/worktrees/feature\t1\t2\thobgoblin-v1-aebf050981ac829e36100020\t${PROJECT_ROOT}\t${PROJECT_SERVER_NAME}`,
          `/srv/projects/example\t2\t0\thobgoblin-v1-0123456789abcdef01234567\t${PROJECT_ROOT}\tlegacy-default`,
        ].join('\n'),
      ),
    ).toEqual([
      {
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        projectRoot: PROJECT_ROOT,
        initialPath: '/srv/projects/example/worktrees/feature',
        terminalNumber: 1,
        attachedClients: 2,
        serverName: PROJECT_SERVER_NAME,
      },
      {
        sessionName: 'hobgoblin-v1-0123456789abcdef01234567',
        projectRoot: PROJECT_ROOT,
        initialPath: '/srv/projects/example',
        terminalNumber: 2,
        attachedClients: 0,
      },
    ])
    expect(
      parseHostList(
        `/srv/projects/example\t1\t0\thobgoblin-v1-aebf050981ac829e36100020\t${PROJECT_ROOT}\tunknown-server`,
      ),
    ).toBeNull()
    expect(
      parseHostList(`/srv/projects/example\t1\t0\thobgoblin-v1-aebf050981ac829e36100020\trelative\tlegacy-default`),
    ).toEqual([])
  })

  test('discovers only sorted Hobgoblin socket names for the current tmux user directory', async () => {
    const discoverServerNames = (
      tmuxCleanup as typeof tmuxCleanup & {
        listLocalHobgoblinTmuxServerNames?: (options: {
          environment: NodeJS.ProcessEnv
          uid: number
          readDirectory: (directory: string, options: { withFileTypes: true }) => Promise<unknown[]>
        }) => Promise<unknown>
      }
    ).listLocalHobgoblinTmuxServerNames
    expect(discoverServerNames).toBeTypeOf('function')
    if (!discoverServerNames) return

    const serverB = 'hobgoblin-project-v1-ffffffffffffffffffffffff'
    const readDirectory = vi.fn(async () => [
      { name: serverB, isSocket: () => true },
      { name: 'default', isSocket: () => true },
      { name: PROJECT_SERVER_NAME, isSocket: () => true },
      { name: 'hobgoblin-project-v1-000000000000000000000000', isSocket: () => false },
    ])

    await expect(
      discoverServerNames({ environment: { TMUX_TMPDIR: '/var/run/example' }, uid: 501, readDirectory }),
    ).resolves.toEqual({ ok: true, serverNames: [PROJECT_SERVER_NAME, serverB] })
    expect(readDirectory).toHaveBeenCalledWith('/var/run/example/tmux-501', { withFileTypes: true })
    await expect(
      discoverServerNames({ environment: { TMUX_TMPDIR: 'relative' }, uid: 501, readDirectory }),
    ).resolves.toEqual({ ok: false, message: 'error.tmux-invalid-socket-directory' })
  })

  test('treats a missing current-user socket directory as an empty inventory', async () => {
    const discoverServerNames = (
      tmuxCleanup as typeof tmuxCleanup & {
        listLocalHobgoblinTmuxServerNames?: (options: {
          environment: NodeJS.ProcessEnv
          uid: number
          readDirectory: () => Promise<never>
        }) => Promise<unknown>
      }
    ).listLocalHobgoblinTmuxServerNames
    expect(discoverServerNames).toBeTypeOf('function')
    if (!discoverServerNames) return

    const missingDirectory = Object.assign(new Error('missing'), { code: 'ENOENT' })
    await expect(
      discoverServerNames({
        environment: {},
        uid: 501,
        readDirectory: async () => await Promise.reject(missingDirectory),
      }),
    ).resolves.toEqual({ ok: true, serverNames: [] })
  })

  test('lists every discovered project server before the legacy default server', async () => {
    const listHost = (
      tmuxCleanup as typeof tmuxCleanup & {
        listLocalHostTmuxSessions?: (options: {
          listServerNames: () => Promise<{ ok: true; serverNames: string[] }>
          run: TmuxProcessRunner
        }) => Promise<unknown>
      }
    ).listLocalHostTmuxSessions
    expect(listHost).toBeTypeOf('function')
    if (!listHost) return

    const serverB = 'hobgoblin-project-v1-ffffffffffffffffffffffff'
    const run = vi.fn<TmuxProcessRunner>(async (args) => {
      const origin = args[0] === '-L' ? args[1] : 'legacy-default'
      if (origin === serverB) {
        return {
          ok: false,
          stdout: '',
          stderr: 'no server running on socket',
          message: 'no server running on socket',
        }
      }
      return {
        ok: true,
        stdout: `/srv/projects/example/worktrees/feature\t1\t0\thobgoblin-v1-aebf050981ac829e36100020\t${PROJECT_ROOT}`,
        stderr: '',
      }
    })

    await expect(
      listHost({
        listServerNames: async () => ({ ok: true, serverNames: [serverB, PROJECT_SERVER_NAME] }),
        run,
      }),
    ).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          projectRoot: PROJECT_ROOT,
          initialPath: '/srv/projects/example/worktrees/feature',
          terminalNumber: 1,
          attachedClients: 0,
          serverName: PROJECT_SERVER_NAME,
        },
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          projectRoot: PROJECT_ROOT,
          initialPath: '/srv/projects/example/worktrees/feature',
          terminalNumber: 1,
          attachedClients: 0,
        },
      ],
    })
    expect(run.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
      ['-L', PROJECT_SERVER_NAME],
      ['-L', serverB],
      ['-u', 'list-sessions'],
    ])
  })

  test('fails host inventory when a live server returns malformed output', async () => {
    const listHost = (
      tmuxCleanup as typeof tmuxCleanup & {
        listLocalHostTmuxSessions?: (options: {
          listServerNames: () => Promise<{ ok: true; serverNames: string[] }>
          run: TmuxProcessRunner
        }) => Promise<unknown>
      }
    ).listLocalHostTmuxSessions
    expect(listHost).toBeTypeOf('function')
    if (!listHost) return

    await expect(
      listHost({
        listServerNames: async () => ({ ok: true, serverNames: [PROJECT_SERVER_NAME] }),
        run: async () => ({ ok: true, stdout: 'malformed', stderr: '' }),
      }),
    ).resolves.toEqual({ ok: false, message: 'error.tmux-invalid-output' })
  })

  test('kills only a current session at a validated exact host server origin', async () => {
    const killHost = (
      tmuxCleanup as typeof tmuxCleanup & {
        killLocalHostTmuxSessionByName?: (
          sessionName: string,
          options: { serverName?: string; run: TmuxProcessRunner },
        ) => Promise<unknown>
      }
    ).killLocalHostTmuxSessionByName
    expect(killHost).toBeTypeOf('function')
    if (!killHost) return

    const run = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: '', stderr: '' }))
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'
    await expect(killHost(sessionName, { serverName: PROJECT_SERVER_NAME, run })).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(run).toHaveBeenCalledWith(['-L', PROJECT_SERVER_NAME, 'kill-session', '-t', `=${sessionName}`], undefined)
    await expect(killHost(sessionName, { serverName: 'user-server', run })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
