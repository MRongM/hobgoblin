import { describe, expect, test, vi } from 'vitest'
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

vi.mock('execa', () => ({
  execa: mocks.execa,
}))

describe('parseTmuxSessionList', () => {
  test('parses the Hobgoblin initial-path and terminal-number options', () => {
    expect(
      parseTmuxSessionList(
        [
          '/srv/repo,feature\t1\thobgoblin-v1-aebf050981ac829e36100020',
          '\t\tuser-session',
        ].join('\n'),
      ),
    ).toEqual([
      {
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        initialPath: '/srv/repo,feature',
        terminalNumber: 1,
      },
    ])
  })

  test('skips sessions with missing or corrupt identity metadata', () => {
    expect(
      parseTmuxSessionList(
        [
          '\t\thobgoblin-v1-aebf050981ac829e36100020',
          '/srv/repo\tnot-a-number\thobgoblin-v1-0123456789abcdef01234567',
          '/srv/repo\t0\thobgoblin-v1-89abcdef0123456789abcdef',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  test('returns null instead of guessing malformed field boundaries', () => {
    expect(parseTmuxSessionList('missing-fields')).toBeNull()
    expect(parseTmuxSessionList('/srv/repo\t1\tname\textra')).toBeNull()
    expect(parseTmuxSessionList('relative/path\t1\tname')).toEqual([])
  })

  test('accepts empty output as an empty session list', () => {
    expect(parseTmuxSessionList('')).toEqual([])
  })
})

describe('local tmux commands', () => {
  test('refreshes a cached executable once when its session list becomes malformed', async () => {
    vi.resetModules()
    mocks.execa.mockReset()
    mocks.execa
      .mockResolvedValueOnce({ failed: true, code: 'ENOENT', stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '/opt/tools/tmux-v1\n', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/srv/repo\t1\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'unsupported output', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '/opt/tools/tmux-v2\n', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '/srv/repo\t1\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
    const { listLocalTmuxSessions: listSessions } = await import('#/system/tmux-cleanup.ts')

    await expect(listSessions()).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
        },
      ],
    })
    await expect(listSessions()).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
        },
      ],
    })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      5,
      expect.stringMatching(/^\//u),
      ['-lc', 'command -v tmux'],
      expect.objectContaining({ reject: false }),
    )
    expect(mocks.execa).toHaveBeenNthCalledWith(
      6,
      '/opt/tools/tmux-v2',
      ['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
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
        stdout: '/srv/repo\t1\thobgoblin-v1-aebf050981ac829e36100020',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    await expect(listLocalTmuxSessions()).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
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
      ['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      expect.objectContaining({ reject: false }),
    )
    await expect(killLocalTmuxSessionByName('hobgoblin-v1-aebf050981ac829e36100020')).resolves.toEqual({
      ok: true,
      message: '',
    })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      4,
      '/opt/homebrew/bin/tmux',
      ['kill-session', '-t', '=hobgoblin-v1-aebf050981ac829e36100020'],
      expect.objectContaining({ reject: false }),
    )
  })

  test('forces UTF-8 when listing sessions so the protocol delimiter survives a missing locale', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({
      ok: true,
      stdout: '/srv/repo\t1\thobgoblin-v1-aebf050981ac829e36100020',
      stderr: '',
    }))

    await expect(listLocalTmuxSessions({ run })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          initialPath: '/srv/repo',
          terminalNumber: 1,
        },
      ],
    })
    expect(run).toHaveBeenCalledWith(['-u', 'list-sessions', '-F', TMUX_SESSION_LIST_FORMAT], undefined)
  })

  test('treats an installed tmux with no server as an empty list', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({
      ok: false,
      stdout: '',
      stderr: 'no server running on /tmp/tmux-501/default',
      message: 'no server running on /tmp/tmux-501/default',
    }))

    await expect(listLocalTmuxSessions({ run })).resolves.toEqual({ ok: true, sessions: [] })
  })

  test('preserves unavailable and malformed-output failures', async () => {
    const unavailable = vi.fn<TmuxProcessRunner>(async () => ({
      ok: false,
      stdout: '',
      stderr: '',
      message: 'error.tmux-unavailable',
    }))
    const malformed = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: 'bad\trow', stderr: '' }))

    await expect(listLocalTmuxSessions({ run: unavailable })).resolves.toEqual({
      ok: false,
      message: 'error.tmux-unavailable',
    })
    await expect(listLocalTmuxSessions({ run: malformed })).resolves.toEqual({
      ok: false,
      message: 'error.tmux-invalid-output',
    })
  })

  test('kills an exact current-protocol session name and rejects other names', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: '', stderr: '' }))
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'

    await expect(killLocalTmuxSessionByName(sessionName, { run })).resolves.toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(['kill-session', '-t', `=${sessionName}`], undefined)

    await expect(killLocalTmuxSessionByName('goblin-feature', { run })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('recognizes tmux responses that mean an exact session is already missing', () => {
    expect(isTmuxSessionMissingMessage("can't find session: hobgoblin-v1-example")).toBe(true)
    expect(isTmuxSessionMissingMessage('no server running on /tmp/tmux-501/default')).toBe(true)
    expect(isTmuxSessionMissingMessage('permission denied')).toBe(false)
  })
})
