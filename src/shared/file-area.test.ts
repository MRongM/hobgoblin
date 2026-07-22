import { describe, expect, test } from 'vitest'
import { normalizeDetachedFileAreaWindowRequest, type DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'

const valid: DetachedFileAreaWindowRequest = {
  repo: { kind: 'local', id: '/workspace/repo' },
  branch: 'feature/detached-window',
  tab: 'history',
  releasePoint: { x: 1200, y: 420 },
}

describe('detached file area window request', () => {
  test('normalizes a valid local request', () => {
    expect(normalizeDetachedFileAreaWindowRequest(valid)).toEqual(valid)
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
          id: 'ignored',
          ref: {
            id: 'ignored',
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
