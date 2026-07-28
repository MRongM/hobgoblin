import { describe, expect, test } from 'vitest'
import {
  isRepositoryTemporaryWorktreePath,
  repositoryTemporaryWorktreePath,
} from '#/server/modules/repository-temporary-worktree.ts'

describe('repository temporary worktree paths', () => {
  test.each([
    ['/workspace/api', /^\/workspace\/\.hobgoblin-merge-out-api-[0-9a-f]{16}$/],
    ['ssh-config://host/srv/workspace/api', /^\/srv\/workspace\/\.hobgoblin-merge-out-api-[0-9a-f]{16}$/],
  ])('creates a deterministic repository-sibling merge-out path for %s', (repoId, expected) => {
    const first = repositoryTemporaryWorktreePath(repoId, 'merge-out', 'sha256:plan', 'main')
    const second = repositoryTemporaryWorktreePath(repoId, 'merge-out', 'sha256:plan', 'main')

    expect(first).toBe(second)
    expect(first).toMatch(expected)
    expect(first && isRepositoryTemporaryWorktreePath(repoId, 'merge-out', first)).toBe(true)
  })

  test('separates batch-merge and merge-out namespaces', () => {
    const mergeOut = repositoryTemporaryWorktreePath('/workspace/api', 'merge-out', 'sha256:plan', 'main')
    const batchMerge = repositoryTemporaryWorktreePath('/workspace/api', 'batch-merge', 'sha256:plan', 'main')

    expect(mergeOut).not.toBe(batchMerge)
    expect(mergeOut && isRepositoryTemporaryWorktreePath('/workspace/api', 'batch-merge', mergeOut)).toBe(false)
    expect(batchMerge && isRepositoryTemporaryWorktreePath('/workspace/api', 'merge-out', batchMerge)).toBe(false)
  })

  test.each([
    '/other/.hobgoblin-merge-out-api-0123456789abcdef',
    '/workspace/.hobgoblin-merge-out-web-0123456789abcdef',
    '/workspace/.hobgoblin-merge-out-api-0123456789abcdeF',
    '/workspace/.hobgoblin-merge-out-api-0123456789abcde',
    '/workspace/api-main',
  ])('rejects unowned lookalike %s', (candidatePath) => {
    expect(isRepositoryTemporaryWorktreePath('/workspace/api', 'merge-out', candidatePath)).toBe(false)
  })
})
