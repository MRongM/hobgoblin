import { describe, expect, test, vi } from 'vitest'
import { isValidTmuxSessionId } from '#/shared/tmux-cleanup.ts'
import {
  isTmuxSessionMissingMessage,
  killLocalTmuxSession,
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

describe('tmux cleanup contract', () => {
  test('accepts only tmux server session ids', () => {
    expect(isValidTmuxSessionId('$0')).toBe(true)
    expect(isValidTmuxSessionId('$123')).toBe(true)
    expect(isValidTmuxSessionId('123')).toBe(false)
    expect(isValidTmuxSessionId('$1; touch /tmp/example')).toBe(false)
  })
})

describe('parseTmuxSessionList', () => {
  test('parses tab-delimited sessions without treating commas in paths as separators', () => {
    expect(
      parseTmuxSessionList(
        ['hobgoblin-v1-aebf050981ac829e36100020\t$3\t/srv/repo,feature', 'user-session\t$4\t/srv/other'].join('\n'),
      ),
    ).toEqual([
      {
        sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
        sessionId: '$3',
        sessionPath: '/srv/repo,feature',
      },
      { sessionName: 'user-session', sessionId: '$4', sessionPath: '/srv/other' },
    ])
  })

  test('returns null instead of guessing malformed field boundaries', () => {
    expect(parseTmuxSessionList('missing-fields\t$1')).toBeNull()
    expect(parseTmuxSessionList('name\tnot-an-id\t/srv/repo')).toBeNull()
    expect(parseTmuxSessionList('name\t$1\trelative/path')).toBeNull()
  })

  test('accepts empty output as an empty session list', () => {
    expect(parseTmuxSessionList('')).toEqual([])
  })
})

describe('local tmux commands', () => {
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
        stdout: 'hobgoblin-v1-aebf050981ac829e36100020\t$3\t/srv/repo',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    await expect(listLocalTmuxSessions()).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          sessionId: '$3',
          sessionPath: '/srv/repo',
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
      ['list-sessions', '-F', TMUX_SESSION_LIST_FORMAT],
      expect.objectContaining({ reject: false }),
    )
    await expect(killLocalTmuxSessionByName('hobgoblin-v1-aebf050981ac829e36100020')).resolves.toEqual({
      ok: true,
      message: '',
    })
    await expect(killLocalTmuxSession('$3')).resolves.toEqual({ ok: true, message: '' })
    expect(mocks.execa).toHaveBeenNthCalledWith(
      4,
      '/opt/homebrew/bin/tmux',
      ['kill-session', '-t', 'hobgoblin-v1-aebf050981ac829e36100020'],
      expect.objectContaining({ reject: false }),
    )
    expect(mocks.execa).toHaveBeenNthCalledWith(
      5,
      '/opt/homebrew/bin/tmux',
      ['kill-session', '-t', '$3'],
      expect.objectContaining({ reject: false }),
    )
  })

  test('lists sessions with the protocol format', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({
      ok: true,
      stdout: 'hobgoblin-v1-aebf050981ac829e36100020\t$3\t/srv/repo',
      stderr: '',
    }))

    await expect(listLocalTmuxSessions({ run })).resolves.toEqual({
      ok: true,
      sessions: [
        {
          sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
          sessionId: '$3',
          sessionPath: '/srv/repo',
        },
      ],
    })
    expect(run).toHaveBeenCalledWith(['list-sessions', '-F', TMUX_SESSION_LIST_FORMAT], undefined)
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

  test('kills the literal approved session id and rejects invalid ids', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: '', stderr: '' }))

    await expect(killLocalTmuxSession('$3', { run })).resolves.toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(['kill-session', '-t', '$3'], undefined)

    await expect(killLocalTmuxSession('bad', { run })).resolves.toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('kills an exact current-protocol session name and rejects other names', async () => {
    const run = vi.fn<TmuxProcessRunner>(async () => ({ ok: true, stdout: '', stderr: '' }))
    const sessionName = 'hobgoblin-v1-aebf050981ac829e36100020'

    await expect(killLocalTmuxSessionByName(sessionName, { run })).resolves.toEqual({ ok: true, message: '' })
    expect(run).toHaveBeenCalledWith(['kill-session', '-t', sessionName], undefined)

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
