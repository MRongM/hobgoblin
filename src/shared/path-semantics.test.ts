import { describe, expect, test } from 'vitest'
import {
  joinWorktreeRelativePath,
  pathStyle,
  safeRelativePath,
  sameLocalHostPath,
  worktreeRelativePathFromAbsolute,
} from '#/shared/path-semantics.ts'

describe('sameLocalHostPath', () => {
  test('matches Windows drive paths with conventional WSL drive mounts', () => {
    expect(sameLocalHostPath('C:\\Users\\dev\\repo', '/mnt/c/Users/dev/repo')).toBe(true)
    expect(sameLocalHostPath('c:/users/dev/repo/./src', '/mnt/C/Users/dev/repo/src')).toBe(true)
  })

  test('matches lexically equivalent POSIX paths without using Node path APIs', () => {
    expect(sameLocalHostPath('/srv/projects/other/../repo', '/srv/projects/repo')).toBe(true)
  })

  test('keeps unrelated local paths distinct', () => {
    expect(sameLocalHostPath('C:\\repo', '/mnt/d/repo')).toBe(false)
    expect(sameLocalHostPath('/mnt/c/repo', '/srv/repo')).toBe(false)
    expect(sameLocalHostPath('/srv/Repo', '/srv/repo')).toBe(false)
  })
})

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

  test('rejects absolute paths that escape through dot segments', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo/../outside.ts')).toBeNull()
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo\\..\\outside.ts')).toBeNull()
  })

  test('normalizes absolute dot segments that remain inside the worktree', () => {
    expect(worktreeRelativePathFromAbsolute('/repo', '/repo/src/../app.ts')).toBe('app.ts')
    expect(worktreeRelativePathFromAbsolute('C:\\repo', 'C:\\repo\\src\\..\\app.ts')).toBe('app.ts')
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
