import { describe, expect, test } from 'vitest'
import {
  normalizeTerminalLaunchMode,
  normalizeTerminalClientMessage,
  normalizeTerminalRealtimeMessage,
  normalizeTerminalSessionSummaryList,
} from '#/shared/terminal.ts'

describe('terminal protocol normalization', () => {
  test('normalizes terminal launch mode to native unless tmux is explicitly requested', () => {
    expect(normalizeTerminalLaunchMode(undefined)).toBe('native')
    expect(normalizeTerminalLaunchMode('invalid')).toBe('native')
    expect(normalizeTerminalLaunchMode('native')).toBe('native')
    expect(normalizeTerminalLaunchMode('tmux-if-available')).toBe('tmux-if-available')
  })

  test('normalizes invalid terminal create launch modes at the protocol boundary', () => {
    expect(
      normalizeTerminalClientMessage({
        type: 'request',
        requestId: 'request_launch_mode',
        action: 'create',
        input: {
          repoRoot: '/repo',
          branch: 'main',
          worktreePath: '/repo',
          kind: 'primary',
          launchMode: 'invalid',
        },
      }),
    ).toMatchObject({
      action: 'create',
      input: { launchMode: 'native' },
    })
  })

  test('preserves phase and message on session summaries', () => {
    const summaries = normalizeTerminalSessionSummaryList([
      {
        sessionId: 'term_abcdefghijklmnop',
        key: '/repo\0/repo\0terminal-1',
        cwd: '/repo',
        controller: { attachmentId: 'attachment_a', status: 'connected' },
        processName: 'bash',
        canonicalTitle: null,
        cols: 132,
        rows: 41,
        displayOrder: 0,
        phase: 'open',
        message: null,
        tmuxBacked: true,
      },
    ])

    expect(summaries).not.toBeNull()
    expect(summaries?.[0]).toMatchObject({ phase: 'open', message: null, tmuxBacked: true })
  })

  test('rejects invalid session phases', () => {
    expect(
      normalizeTerminalSessionSummaryList([
        {
          sessionId: 'term_abcdefghijklmnop',
          key: '/repo\0/repo\0terminal-1',
          cwd: '/repo',
          controller: { attachmentId: 'attachment_a', status: 'connected' },
          processName: 'bash',
          canonicalTitle: null,
          cols: 132,
          rows: 41,
          displayOrder: 0,
          phase: 'booting',
          message: null,
        },
      ]),
    ).toBeNull()
  })

  test('rejects grace controller status', () => {
    expect(
      normalizeTerminalSessionSummaryList([
        {
          sessionId: 'term_abcdefghijklmnop',
          key: '/repo\0/repo\0terminal-1',
          cwd: '/repo',
          controller: { attachmentId: 'attachment_a', status: 'grace' },
          processName: 'bash',
          canonicalTitle: null,
          cols: 80,
          rows: 24,
          displayOrder: 0,
          phase: 'open',
          message: null,
        },
      ]),
    ).toBeNull()
  })

  test('preserves phase on ownership events', () => {
    const message = normalizeTerminalRealtimeMessage({
      type: 'ownership',
      event: {
        sessionId: 'term_abcdefghijklmnop',
        controller: { attachmentId: 'attachment_a', status: 'connected' },
        cols: 120,
        rows: 36,
        phase: 'open',
      },
    })

    expect(message).toMatchObject({
      type: 'ownership',
      event: { phase: 'open' },
    })
  })

  test('validates measured create geometry from clients', () => {
    expect(
      normalizeTerminalClientMessage({
        type: 'request',
        requestId: 'request_a',
        action: 'create',
        input: {
          repoRoot: '/repo',
          branch: 'main',
          worktreePath: '/repo',
          kind: 'primary',
          cols: 132,
          rows: 41,
          attachmentId: 'attachment_a',
        },
      }),
    ).toMatchObject({ action: 'create' })
  })

  test('accepts only a boolean tmux close intent', () => {
    const base = {
      type: 'request' as const,
      requestId: 'request_close',
      action: 'close' as const,
      input: { sessionId: 'term_abcdefghijklmnop' },
    }

    expect(normalizeTerminalClientMessage(base)).toMatchObject({ action: 'close', input: base.input })
    expect(
      normalizeTerminalClientMessage({
        ...base,
        input: { ...base.input, closeTmuxSession: true },
      }),
    ).toMatchObject({ action: 'close', input: { closeTmuxSession: true } })
    expect(
      normalizeTerminalClientMessage({
        ...base,
        input: { ...base.input, closeTmuxSession: 'true' },
      }),
    ).toBeNull()
  })
})
