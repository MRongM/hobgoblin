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

  test.each(['powershell', 'wsl'] as const)(
    'preserves the supported %s Windows internal terminal shell override',
    (windowsInternalTerminalShell) => {
      expect(
        normalizeTerminalClientMessage({
          type: 'request',
          requestId: `request_${windowsInternalTerminalShell}`,
          action: 'create',
          input: {
            repoRoot: '/repo',
            branch: 'main',
            worktreePath: '/repo',
            kind: 'primary',
            windowsInternalTerminalShell,
          },
        }),
      ).toMatchObject({
        action: 'create',
        input: { windowsInternalTerminalShell },
      })
    },
  )

  test('drops unsupported Windows internal terminal shell overrides at the protocol boundary', () => {
    const message = normalizeTerminalClientMessage({
      type: 'request',
      requestId: 'request_cmd_override',
      action: 'create',
      input: {
        repoRoot: '/repo',
        branch: 'main',
        worktreePath: '/repo',
        kind: 'primary',
        windowsInternalTerminalShell: 'cmd',
      },
    })

    expect(message).toMatchObject({ action: 'create' })
    if (!message || message.action !== 'create') return
    expect(message.input.windowsInternalTerminalShell).toBeUndefined()
  })

  test('preserves phase, message, input state, and tmux close capability on session summaries', () => {
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
        hasUserInput: false,
        tmuxBacked: true,
        tmuxCloseSupported: false,
      },
    ])

    expect(summaries).not.toBeNull()
    expect(summaries?.[0]).toMatchObject({
      phase: 'open',
      message: null,
      hasUserInput: false,
      tmuxBacked: true,
      tmuxCloseSupported: false,
    })
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

  test('accepts a measured batch tmux-open request', () => {
    expect(
      normalizeTerminalClientMessage({
        type: 'request',
        requestId: 'request_tmux_open',
        action: 'open-tmux-sessions',
        input: {
          repoRoot: '/repo',
          branch: 'main',
          worktreePath: '/repo',
          cols: 132,
          rows: 41,
          attachmentId: 'attachment_a',
        },
      }),
    ).toMatchObject({ action: 'open-tmux-sessions' })
  })

  test('accepts only a valid tmux return-to-bottom request', () => {
    const request = {
      type: 'request' as const,
      requestId: 'request_return_bottom',
      action: 'return-to-bottom' as const,
      input: {
        sessionId: 'term_abcdefghijklmnop',
        attachmentId: 'attachment_a',
      },
    }

    expect(normalizeTerminalClientMessage(request)).toMatchObject({
      action: 'return-to-bottom',
      input: request.input,
    })
    expect(
      normalizeTerminalClientMessage({ ...request, input: { ...request.input, sessionId: '../unsafe' } }),
    ).toBeNull()
  })

  test('accepts only valid tmux page directions', () => {
    const request = {
      type: 'request' as const,
      requestId: 'request_page_tmux',
      action: 'page-tmux' as const,
      input: {
        sessionId: 'term_abcdefghijklmnop',
        attachmentId: 'attachment_a',
        direction: 'up' as const,
      },
    }

    expect(normalizeTerminalClientMessage(request)).toMatchObject({
      action: 'page-tmux',
      input: request.input,
    })
    expect(
      normalizeTerminalClientMessage({ ...request, input: { ...request.input, direction: 'down' } }),
    ).toMatchObject({ action: 'page-tmux', input: { direction: 'down' } })
    expect(
      normalizeTerminalClientMessage({ ...request, input: { ...request.input, direction: 'sideways' } }),
    ).toBeNull()
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

  test('accepts Telegram target intent without allowing the client to nominate an attachment', () => {
    expect(
      normalizeTerminalClientMessage({
        type: 'request',
        requestId: 'request_telegram_target',
        action: 'mark-telegram-input-target',
        input: {
          sessionId: 'term_abcdefghijklmnop',
          attachmentId: 'spoofed_attachment',
        },
      }),
    ).toEqual({
      type: 'request',
      requestId: 'request_telegram_target',
      action: 'mark-telegram-input-target',
      input: { sessionId: 'term_abcdefghijklmnop' },
    })
  })

  test('accepts only a boolean terminal write attribution', () => {
    const request = {
      type: 'request' as const,
      requestId: 'request_write',
      action: 'write' as const,
      input: {
        sessionId: 'term_abcdefghijklmnop',
        data: '\x1b[1;1R',
        attachmentId: 'attachment_a',
        userIntent: false,
      },
    }

    expect(normalizeTerminalClientMessage(request)).toMatchObject({
      action: 'write',
      input: { userIntent: false },
    })
    expect(
      normalizeTerminalClientMessage({
        ...request,
        input: { ...request.input, userIntent: 'false' },
      }),
    ).toBeNull()
  })
})
