import { describe, expect, test, vi } from 'vitest'
import { isValidTmuxSessionId } from '#/shared/tmux-cleanup.ts'
import {
  killLocalTmuxSession,
  listLocalTmuxSessions,
  parseTmuxSessionList,
  TMUX_SESSION_LIST_FORMAT,
  type TmuxProcessRunner,
} from '#/system/tmux-cleanup.ts'

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
})
