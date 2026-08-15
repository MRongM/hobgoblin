import { describe, expect, test } from 'vitest'
import {
  branchWorkspaceBatchMergeTemporaryWorktreePath,
  isBranchWorkspaceBatchMergeTemporaryWorktreePath,
} from '#/server/modules/branch-workspace-batch-merge-worktree.ts'

describe('branch workspace batch merge temporary worktree paths', () => {
  test.each([
    ['/workspace/api', '/workspace/.hobgoblin-batch-merge-api-'],
    ['ssh-config://host/srv/workspace/api', '/srv/workspace/.hobgoblin-batch-merge-api-'],
  ])('creates a deterministic repository-sibling path for %s', (repoId, prefix) => {
    const first = branchWorkspaceBatchMergeTemporaryWorktreePath(repoId, 'sha256:plan', 'release/v2')
    const second = branchWorkspaceBatchMergeTemporaryWorktreePath(repoId, 'sha256:plan', 'release/v2')

    expect(first).toBe(second)
    expect(first?.startsWith(prefix)).toBe(true)
    expect(first && isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId, first)).toBe(true)
  })

  test('rejects lookalike paths outside the repository parent or without the exact prefix', () => {
    const repoId = '/workspace/api'
    expect(
      isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId, '/other/.hobgoblin-batch-merge-api-0123456789abcdef'),
    ).toBe(false)
    expect(isBranchWorkspaceBatchMergeTemporaryWorktreePath(repoId, '/workspace/hobgoblin-batch-merge-api-x')).toBe(
      false,
    )
  })
})
