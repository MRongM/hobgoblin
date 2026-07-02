import { describe, expect, test } from 'vitest'
import {
  joinWorktreeRelativePath,
  pathStyle,
  safeRelativePath,
  worktreeRelativePathFromAbsolute,
} from '#/shared/path-semantics.ts'

describe('pathStyle', () => {
  test('classifies posix, windows drive, UNC, and relative paths', () => {
    expect(pathStyle('/repo/src/app.ts')).toBe('posixAbsolute')
    expect(pathStyle('C:\\repo\\src\\app.ts')).toBe('windowsDriveAbsolute')
    expect(pathStyle('c:/repo/src/app.ts')).toBe('windowsDriveAbsolute')
    expect(pathStyle('\\\\server\\share\\repo')).toBe('windowsUncAbsolute')
    expect(pathStyle('src/app.ts')).toBe('relative')
  })
})

describe('safeRelativePath', () => {
  test('normalizes safe relative paths to slash separators', () => {
    expect(safeRelativePath('src/app.ts')).toBe('src/app.ts')
    expect(safeRelativePath('./src/app.ts')).toBe('src/app.ts')
  })

  test('rejects unsafe relative path input', () => {
    expect(safeRelativePath('')).toBeNull()
    expect(safeRelativePath('../app.ts')).toBeNull()
    expect(safeRelativePath('src/../app.ts')).toBeNull()
    expect(safeRelativePath('src//app.ts')).toBeNull()
    expect(safeRelativePath('src\\app.ts')).toBeNull()
    expect(safeRelativePath('src/\0/app.ts')).toBeNull()
  })
})

describe('worktreeRelativePathFromAbsolute', () => {
  test('returns slash relative paths for contained POSIX paths', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo/src/app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo')).toBe('.')
  })

  test('rejects POSIX sibling prefixes', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo2/app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('/repo', '/other/app.ts')).toBeNull()
  })

  test('returns slash relative paths for contained Windows drive paths', () => {
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo\\src\\app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('c:/repo', 'C:\\repo\\src\\app.ts')).toBe('src/app.ts')
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo')).toBe('.')
  })

  test('rejects Windows siblings and different drives', () => {
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo2\\app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'D:\\repo\\app.ts')).toBeNull()
  })

  test('does not mix POSIX and Windows styles', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', 'C:\\repo\\app.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('C:\\repo', '/repo/app.ts')).toBeNull()
  })
})

describe('joinWorktreeRelativePath', () => {
  test('joins POSIX and Windows worktree paths with the existing separator style', () => {
    expect(joinWorktreeRelativePath('/repo', 'src/app.ts')).toBe('/repo/src/app.ts')
    expect(joinWorktreeRelativePath('C:\\repo', 'src/app.ts')).toBe('C:\\repo\\src\\app.ts')
    expect(joinWorktreeRelativePath('C:/repo', 'src/app.ts')).toBe('C:/repo/src/app.ts')
  })
})
