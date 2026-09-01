import { describe, expect, test } from 'vitest'
import { localFilePathIdentityKey, resolveLocalFilePath, sameLocalFilePath } from '#/shared/local-file-path-bridge.ts'

describe('local file path bridge', () => {
  test('unifies native Windows drives with standard WSL mounts', () => {
    expect(sameLocalFilePath('C:\\Users\\dev\\repo', 'c:/users/dev/repo')).toBe(true)
    expect(sameLocalFilePath('C:\\Users\\dev\\repo', '/mnt/c/Users/dev/repo')).toBe(true)
    expect(resolveLocalFilePath('/mnt/c/Users/dev/repo')).toMatchObject({
      execution: 'windows',
      inputKind: 'wsl-drive-mount',
      projectPath: 'C:\\Users\\dev\\repo',
    })
  })

  test('keeps ordinary UNC paths Windows-local', () => {
    expect(resolveLocalFilePath('\\\\server\\share\\Repo')).toMatchObject({
      execution: 'windows',
      inputKind: 'windows-unc',
      projectPath: '\\\\server\\share\\Repo',
    })
    expect(sameLocalFilePath('\\\\SERVER\\SHARE\\Repo', '\\\\server\\share\\repo')).toBe(true)
  })

  test('unifies WSL locators and both WSL UNC hosts', () => {
    const locator = 'wsl://Ubuntu/home/dev/repo'
    expect(sameLocalFilePath(locator, '\\\\wsl.localhost\\ubuntu\\home\\dev\\repo')).toBe(true)
    expect(sameLocalFilePath(locator, '\\\\wsl$\\Ubuntu\\home\\dev\\repo')).toBe(true)
    expect(resolveLocalFilePath('\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo')).toMatchObject({
      execution: 'wsl',
      inputKind: 'wsl-unc',
      distribution: 'Ubuntu',
      linuxPath: '/home/dev/repo',
      projectPath: locator,
    })
  })

  test('recognizes a WSL distribution root without treating it as an ordinary UNC share', () => {
    expect(resolveLocalFilePath('\\\\wsl.localhost\\Ubuntu')).toMatchObject({
      execution: 'wsl',
      inputKind: 'wsl-unc',
      distribution: 'Ubuntu',
      linuxPath: '/',
      projectPath: 'wsl://Ubuntu/',
    })
    expect(resolveLocalFilePath('\\\\wsl$\\Ubuntu\\')).toMatchObject({
      execution: 'wsl',
      linuxPath: '/',
    })
  })

  test('requires WSL context for a bare Linux path', () => {
    expect(resolveLocalFilePath('/home/dev/repo')).toMatchObject({ execution: 'posix' })
    expect(resolveLocalFilePath('/home/dev/repo', { kind: 'wsl', distribution: 'Ubuntu' })).toMatchObject({
      execution: 'wsl',
      distribution: 'Ubuntu',
      linuxPath: '/home/dev/repo',
      projectPath: 'wsl://Ubuntu/home/dev/repo',
    })
    expect(
      sameLocalFilePath('wsl://Ubuntu/home/dev/repo', '/home/dev/repo', {
        kind: 'wsl',
        distribution: 'Ubuntu',
      }),
    ).toBe(true)
    expect(
      sameLocalFilePath('wsl://Ubuntu/home/dev/repo', '/home/dev/repo', {
        kind: 'wsl',
        distribution: ' Ubuntu ',
      }),
    ).toBe(true)
  })

  test('keeps Linux path case significant inside one distribution', () => {
    expect(sameLocalFilePath('wsl://Ubuntu/home/dev/Repo', 'wsl://ubuntu/home/dev/repo')).toBe(false)
  })

  test('matches lexically equivalent POSIX paths without changing case semantics', () => {
    expect(sameLocalFilePath('/srv/projects/other/../repo', '/srv/projects/repo')).toBe(true)
    expect(sameLocalFilePath('/srv/Repo', '/srv/repo')).toBe(false)
  })

  test('rejects remote SSH identifiers, relative paths, and malformed input', () => {
    expect(localFilePathIdentityKey('ssh-config://example/srv/repo')).toBeNull()
    expect(resolveLocalFilePath('repo')).toBeNull()
    expect(resolveLocalFilePath('C:repo')).toBeNull()
    expect(resolveLocalFilePath('\\\\wsl$\\\\home\\dev')).toBeNull()
    expect(resolveLocalFilePath('/home/\0/repo')).toBeNull()
  })
})
