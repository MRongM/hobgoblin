import { describe, expect, test } from 'vitest'
import { nextVisibleTerminal, reorderVisibleTerminals } from '#/web/components/terminal/terminal-stash.ts'

describe('terminal stash', () => {
  test('chooses the closest remaining visible terminal when the selected terminal is stashed', () => {
    expect(nextVisibleTerminal(['a', 'b', 'c'], new Set(['b']), 'b')).toBe('c')
    expect(nextVisibleTerminal(['a', 'b', 'c'], new Set(['b', 'c']), 'b')).toBe('a')
    expect(nextVisibleTerminal(['a'], new Set(['a']), 'a')).toBeNull()
  })

  test('reorders visible terminals while retaining stashed terminals in the full order', () => {
    expect(reorderVisibleTerminals(['a', 'hidden', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'hidden', 'a', 'b'])
  })
})
