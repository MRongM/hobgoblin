import { describe, expect, test } from 'vitest'
import { terminalSessionScope } from '#/server/terminal/terminal-scope.ts'

describe('terminalSessionScope', () => {
  test('normalizes equivalent Windows drive paths independent of host OS', () => {
    expect(terminalSessionScope('c:/Users/test/repo')).toBe('C:\\users\\test\\repo')
    expect(terminalSessionScope('C:\\Users\\test\\repo\\.')).toBe('C:\\users\\test\\repo')
  })

  test('uses case-insensitive identities for Windows paths', () => {
    expect(terminalSessionScope('C:\\Users\\Test\\Repo')).toBe(terminalSessionScope('c:/users/test/repo'))
    expect(terminalSessionScope('\\\\Server\\Share\\Repo')).toBe(terminalSessionScope('\\\\server\\share\\repo'))
  })

  test('keeps remote repo ids unchanged', () => {
    expect(terminalSessionScope('ssh-config://prod/srv/repo')).toBe('ssh-config://prod/srv/repo')
  })
})
