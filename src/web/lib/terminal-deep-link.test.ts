import { describe, expect, test } from 'vitest'
import {
  buildTerminalDeepLinkUrl,
  clearTerminalDeepLinkParams,
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

  test('round-trips an optional branch workspace member scope only when both identifiers exist', () => {
    const url = buildTerminalDeepLinkUrl('http://192.168.1.23:32200', {
      repoId: '/workspace/api',
      worktreePath: '/workspace/goblin-feature-auth/api',
      branch: 'feature/auth',
      terminalId: 'terminal-2',
      branchWorkspaceScope: {
        workspaceRootId: '/workspace',
        branchWorkspaceId: 'branch-1',
      },
    })

    expect(url).toContain('workspace=%2Fworkspace')
    expect(url).toContain('branchWorkspace=branch-1')
    expect(parseTerminalDeepLinkUrl(url)).toEqual({
      repoId: '/workspace/api',
      worktreePath: '/workspace/goblin-feature-auth/api',
      branch: 'feature/auth',
      terminalId: 'terminal-2',
      branchWorkspaceScope: {
        workspaceRootId: '/workspace',
        branchWorkspaceId: 'branch-1',
      },
    })

    expect(
      parseTerminalDeepLinkUrl(
        'http://192.168.1.23:32200/?view=terminal&repo=%2Frepo&worktree=%2Ftree&workspace=%2Fworkspace',
      ),
    ).toEqual({ repoId: '/repo', worktreePath: '/tree', branch: undefined, terminalId: undefined })
  })

  test('clears terminal and branch workspace scope parameters while preserving unrelated URL state', () => {
    expect(
      clearTerminalDeepLinkParams(
        new URL(
          'http://192.168.1.23:32200/?view=terminal&repo=%2Frepo&worktree=%2Ftree&workspace=%2Fworkspace&branchWorkspace=branch-1&keep=yes#status',
        ),
      ).toString(),
    ).toBe('http://192.168.1.23:32200/?keep=yes#status')
  })
})
