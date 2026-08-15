import { describe, expect, test } from 'vitest'
import * as terminalSessionKeys from '#/web/components/terminal/terminal-session-keys.ts'

describe('terminal session keys', () => {
  test('uses one case-insensitive identity for equivalent Windows paths', () => {
    expect(
      terminalSessionKeys.worktreeTerminalKey('c:/Users/Test/Repo/.', 'C:\\USERS\\TEST\\Repo-Feature'),
    ).toBe('C:\\users\\test\\repo\0C:\\users\\test\\repo-feature')
  })

  test('parses a canonical worktree terminal key', () => {
    const parseWorktreeTerminalKey = Reflect.get(terminalSessionKeys, 'parseWorktreeTerminalKey') as (
      key: string,
    ) => { repoRoot: string; worktreePath: string } | null

    expect(parseWorktreeTerminalKey('/workspace/repo\0/worktrees/feature-a')).toEqual({
      repoRoot: '/workspace/repo',
      worktreePath: '/worktrees/feature-a',
    })
  })

  test.each(['', '/workspace/repo', '\0/worktree', '/workspace/repo\0', '/workspace/repo\0/worktree\0terminal-1'])(
    'rejects malformed worktree terminal key %j',
    (key) => {
      const parseWorktreeTerminalKey = Reflect.get(terminalSessionKeys, 'parseWorktreeTerminalKey') as (
        key: string,
      ) => { repoRoot: string; worktreePath: string } | null

      expect(parseWorktreeTerminalKey(key)).toBeNull()
    },
  )
})
