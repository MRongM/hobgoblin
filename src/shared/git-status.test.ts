import { describe, expect, test } from 'vitest'
import { statusEntryPaths } from '#/shared/git-status.ts'

describe('statusEntryPaths', () => {
  test('includes both sides of renames and copies without duplicate paths', () => {
    expect(
      statusEntryPaths([
        { x: 'R', y: ' ', path: 'src/new.ts', originalPath: 'src/old.ts' },
        { x: ' ', y: 'M', path: 'src/old.ts' },
        { x: 'C', y: ' ', path: 'src/copy.ts', originalPath: 'src/new.ts' },
      ]),
    ).toEqual(['src/old.ts', 'src/new.ts', 'src/copy.ts'])
  })
})
