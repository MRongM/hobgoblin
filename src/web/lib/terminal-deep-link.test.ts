import { describe, expect, test } from 'vitest'
import {
  buildTerminalDeepLinkUrl,
  parseTerminalDeepLinkUrl,
} from '#/web/lib/terminal-deep-link.ts'

describe('terminal deep links', () => {
  test('builds LAN URLs that target the current workspace terminal', () => {
    expect(
      buildTerminalDeepLinkUrl('http://192.168.1.23:32200', {
        repoId: '/repo',
        worktreePath: '/repo-worktree',
        branch: 'feature/lan qr',
        terminalId: 'terminal-2',
      }),
    ).toBe(
      'http://192.168.1.23:32200/?view=terminal&repo=%2Frepo&worktree=%2Frepo-worktree&branch=feature%2Flan+qr&terminal=terminal-2',
    )
  })

  test('parses terminal target URLs and rejects non-terminal URLs', () => {
    expect(
      parseTerminalDeepLinkUrl(
        'http://192.168.1.23:32200/?view=terminal&repo=%2Frepo&worktree=%2Frepo-worktree&branch=feature%2Flan+qr&terminal=terminal-2',
      ),
    ).toEqual({
      repoId: '/repo',
      worktreePath: '/repo-worktree',
      branch: 'feature/lan qr',
      terminalId: 'terminal-2',
    })
    expect(parseTerminalDeepLinkUrl('http://192.168.1.23:32200/')).toBeNull()
    expect(parseTerminalDeepLinkUrl('http://192.168.1.23:32200/?view=terminal&repo=%2Frepo')).toBeNull()
  })
})
