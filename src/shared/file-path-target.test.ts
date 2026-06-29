import { describe, expect, test } from 'vitest'
import {
  editorTargetPathArgument,
  filePathTargetsForText,
  parseFilePathTarget,
} from '#/shared/file-path-target.ts'

describe('parseFilePathTarget', () => {
  test('accepts relative paths with optional line and column targets', () => {
    expect(parseFilePathTarget('src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('./src/app.ts')).toEqual({ path: 'src/app.ts' })
    expect(parseFilePathTarget('"docs/guide.md",')).toEqual({ path: 'docs/guide.md' })
    expect(parseFilePathTarget('src/app.ts:12')).toEqual({ path: 'src/app.ts', line: 12 })
    expect(parseFilePathTarget('src/app.ts:12:3')).toEqual({ path: 'src/app.ts', line: 12, column: 3 })
  })

  test('rejects unsafe or ambiguous path targets', () => {
    expect(parseFilePathTarget('')).toBeNull()
    expect(parseFilePathTarget('https://example.com/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('/repo/src/app.ts')).toBeNull()
    expect(parseFilePathTarget('C:\\repo\\src\\app.ts')).toBeNull()
    expect(parseFilePathTarget('../src/app.ts')).toBeNull()
    expect(parseFilePathTarget('src/../app.ts')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:0')).toBeNull()
    expect(parseFilePathTarget('src/app.ts:12:')).toBeNull()
  })
})

describe('filePathTargetsForText', () => {
  test('finds path-like spans and preserves offsets', () => {
    expect(filePathTargetsForText('see src/app.ts:12 and ./docs/guide.md')).toEqual([
      { text: 'src/app.ts:12', target: { path: 'src/app.ts', line: 12 }, startIndex: 4, endIndex: 17 },
      { text: './docs/guide.md', target: { path: 'docs/guide.md' }, startIndex: 22, endIndex: 37 },
    ])
  })
})

describe('editorTargetPathArgument', () => {
  test('adds line and column only when a line target exists', () => {
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts' })).toBe('/repo/src/app.ts')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12 })).toBe('/repo/src/app.ts:12')
    expect(editorTargetPathArgument({ path: '/repo/src/app.ts', line: 12, column: 3 })).toBe(
      '/repo/src/app.ts:12:3',
    )
  })
})
