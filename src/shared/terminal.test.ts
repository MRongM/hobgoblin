import { describe, expect, test } from 'vitest'
import {
  normalizeTerminalClientMessage,
  normalizeTerminalRealtimeMessage,
  normalizeTerminalSessionSummaryList,
} from '#/shared/terminal.ts'

describe('terminal protocol normalization', () => {
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
      },
    ])

    expect(summaries).not.toBeNull()
    expect(summaries?.[0]).toMatchObject({ phase: 'open', message: null })
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
})
