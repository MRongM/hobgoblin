import { describe, expect, test } from 'vitest'
import { terminalSessionScope } from '#/server/terminal/terminal-scope.ts'

describe('terminalSessionScope', () => {
  test('normalizes equivalent Windows drive paths independent of host OS', () => {
    expect(terminalSessionScope('c:/Users/test/repo')).toBe('C:\\Users\\test\\repo')
    expect(terminalSessionScope('C:\\Users\\test\\repo\\.')).toBe('C:\\Users\\test\\repo')
  })

  test('keeps remote repo ids unchanged', () => {
    expect(terminalSessionScope('ssh-config://prod/srv/repo')).toBe('ssh-config://prod/srv/repo')
  })
})
