import { describe, expect, test } from 'vitest'
import {
  normalizeRepositoryMergeBranchSelection,
  repositoryMergeBranchDisplayName,
  repositoryMergeBranchFullRef,
  repositoryMergeBranchSelectionKey,
} from '#/shared/repository-merge-branch.ts'

describe('repository merge branch selections', () => {
  test('normalizes explicit local and remote selections', () => {
    expect(normalizeRepositoryMergeBranchSelection({ kind: 'local', branch: ' feature/api ' })).toEqual({
      kind: 'local',
      branch: 'feature/api',
    })
    expect(normalizeRepositoryMergeBranchSelection({ kind: 'remote', remoteRef: ' origin/feature/api ' })).toEqual({
      kind: 'remote',
      remoteRef: 'origin/feature/api',
    })
  })

  test('rejects inferred, unsafe, and incomplete selections', () => {
    for (const value of [
      'origin/main',
      { kind: 'local', branch: 'bad\0branch' },
      { kind: 'local', branch: 'HEAD' },
      { kind: 'remote', remoteRef: 'origin/HEAD' },
      { kind: 'remote', remoteRef: 'missing-remote' },
      { kind: 'unknown', branch: 'main' },
      { kind: 'local' },
      null,
    ]) {
      expect(normalizeRepositoryMergeBranchSelection(value)).toBeNull()
    }
  })

  test('keeps same-named local and remote selections distinct', () => {
    expect(repositoryMergeBranchSelectionKey({ kind: 'local', branch: 'origin/main' })).toBe('local:origin/main')
    expect(repositoryMergeBranchSelectionKey({ kind: 'remote', remoteRef: 'origin/main' })).toBe(
      'remote:origin/main',
    )
  })

  test('projects display names and unambiguous full refs', () => {
    expect(repositoryMergeBranchDisplayName({ kind: 'local', branch: 'feature/api' })).toBe('feature/api')
    expect(repositoryMergeBranchDisplayName({ kind: 'remote', remoteRef: 'origin/feature/api' })).toBe(
      'origin/feature/api',
    )
    expect(repositoryMergeBranchFullRef({ kind: 'local', branch: 'feature/api' })).toBe(
      'refs/heads/feature/api',
    )
    expect(repositoryMergeBranchFullRef({ kind: 'remote', remoteRef: 'origin/feature/api' })).toBe(
      'refs/remotes/origin/feature/api',
    )
  })
})
