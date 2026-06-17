import { describe, expect, test } from 'vitest'
import { hasUnmergedStatusEntries, isUnmergedStatusEntry } from '#/shared/git-conflicts.ts'

describe('git conflict status helpers', () => {
  test.each([['DD'], ['AU'], ['UD'], ['UA'], ['DU'], ['AA'], ['UU']])('treats %s as unmerged', (code) => {
    expect(isUnmergedStatusEntry({ x: code[0]!, y: code[1]! })).toBe(true)
  })

  test.each([[' M'], ['M '], ['A '], ['D '], ['??'], ['R ']])('does not treat %s as unmerged', (code) => {
    expect(isUnmergedStatusEntry({ x: code[0]!, y: code[1]! })).toBe(false)
  })

  test('detects any unmerged entry in a status list', () => {
    expect(
      hasUnmergedStatusEntries([
        { x: ' ', y: 'M' },
        { x: 'U', y: 'U' },
      ]),
    ).toBe(true)
  })
})
