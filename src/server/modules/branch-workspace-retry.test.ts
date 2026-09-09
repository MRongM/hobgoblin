import { describe, expect, test } from 'vitest'
import { isTransientBranchWorkspaceFailure, withBranchWorkspaceRetry } from '#/server/modules/branch-workspace-retry.ts'

describe('branch workspace retry', () => {
  test('caps transient failures and immediately rejects deterministic safety errors', async () => {
    for (const [message, expected] of [
      ['temporary', 3],
      ['workspace.branch-workspace.invalid-path', 1],
      ['workspace.branch-workspace.locked-worktree', 1],
    ] as const) {
      let attempts = 0
      await expect(
        withBranchWorkspaceRetry(async () => {
          attempts += 1
          throw new Error(message)
        }),
      ).rejects.toThrow(message)
      expect(attempts).toBe(expected)
    }
  })
  test('retries transient Git failure results as well as rejected promises', async () => {
    let attempts = 0
    const result = await withBranchWorkspaceRetry(
      async () => {
        attempts += 1
        return { ok: attempts === 3, message: attempts === 3 ? 'created' : 'connection reset' }
      },
      { retryResult: (value) => !value.ok && isTransientBranchWorkspaceFailure(value.message) },
    )
    expect(result.ok).toBe(true)
    expect(attempts).toBe(3)
  })
  test('retries transient failures up to three attempts', async () => {
    let attempts = 0
    await expect(
      withBranchWorkspaceRetry(async () => {
        attempts += 1
        if (attempts < 3) throw new Error('temporary')
        return 'ok'
      }),
    ).resolves.toBe('ok')
    expect(attempts).toBe(3)
  })

  test('does not retry an aborted operation', async () => {
    const controller = new AbortController()
    controller.abort()
    let attempts = 0
    await expect(
      withBranchWorkspaceRetry(
        async () => {
          attempts += 1
          throw new Error('temporary')
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('cancelled')
    expect(attempts).toBe(0)
  })
})
