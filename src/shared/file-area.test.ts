import { describe, expect, test } from 'vitest'
import { normalizeDetachedFileAreaWindowRequest, type DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'

const valid: DetachedFileAreaWindowRequest = {
  kind: 'git-worktree',
  repo: { kind: 'local', id: '/workspace/repo' },
  branch: 'feature/detached-window',
  tab: 'history',
  releasePoint: { x: 1200, y: 420 },
}

describe('detached file area window request', () => {
  test('normalizes a valid local request', () => {
    expect(normalizeDetachedFileAreaWindowRequest(valid)).toEqual(valid)
  })

  test('normalizes plain-project and branch-workspace requests', () => {
    const plain = {
      kind: 'plain-project',
      repo: { kind: 'local', id: '/workspace/plain' },
      tab: 'files',
    }
    const workspace = {
      kind: 'branch-workspace',
      root: { kind: 'local', id: '/workspace' },
      branchWorkspaceId: 'feature-one',
      tab: 'status',
    }

    expect(normalizeDetachedFileAreaWindowRequest(plain)).toEqual(plain)
    expect(normalizeDetachedFileAreaWindowRequest(workspace)).toEqual(workspace)
  })

  test('rejects tabs that do not belong to the captured context', () => {
    expect(
      normalizeDetachedFileAreaWindowRequest({
        kind: 'plain-project',
        repo: { kind: 'local', id: '/workspace/plain' },
        tab: 'changes',
      }),
    ).toBeNull()
    expect(
      normalizeDetachedFileAreaWindowRequest({
        kind: 'branch-workspace',
        root: { kind: 'local', id: '/workspace' },
        branchWorkspaceId: 'feature-one',
        tab: 'ports',
      }),
    ).toBeNull()
  })

  test.each(['unknown', '', 'terminal'])('rejects unsupported tab %s', (tab) => {
    expect(normalizeDetachedFileAreaWindowRequest({ ...valid, tab })).toBeNull()
  })

  test('normalizes a remote repo entry and strips resolved host credentials', () => {
    expect(
      normalizeDetachedFileAreaWindowRequest({
        ...valid,
        repo: {
          kind: 'remote',
          id: 'ssh-config://dev/workspace/repo',
          ref: {
            id: 'ssh-config://dev/workspace/repo',
            alias: 'dev',
            remotePath: '/workspace/repo',
            displayName: 'repo',
            host: 'example.test',
            user: 'developer',
          },
        },
      }),
    ).toMatchObject({
      repo: {
        kind: 'remote',
        ref: { alias: 'dev', remotePath: '/workspace/repo' },
      },
    })
  })

  test.each([
    { ...valid, branch: '' },
    { ...valid, branch: 'x'.repeat(513) },
    { ...valid, branch: 'bad\u0000branch' },
    { ...valid, releasePoint: { x: Number.NaN, y: 1 } },
  ])('rejects malformed input %#', (input) => {
    expect(normalizeDetachedFileAreaWindowRequest(input)).toBeNull()
  })
})
