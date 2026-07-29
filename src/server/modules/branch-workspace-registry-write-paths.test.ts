import { describe, expect, test, vi } from 'vitest'
import { cleanupBranchWorkspaceRegistryRecords } from '#/server/modules/branch-workspace-registry-write-paths.ts'

describe('branch workspace registry write paths', () => {
  test.each(['repaired', 'reset'] as const)('publishes the requesting root after a %s cleanup', async (outcome) => {
    const cleanup = vi.fn(async () => ({ ok: true as const, outcome, removedRecords: outcome === 'repaired' ? 2 : 0 }))
    const publishInvalidation = vi.fn()

    await expect(
      cleanupBranchWorkspaceRegistryRecords('/workspace', { cleanup, publishInvalidation }),
    ).resolves.toEqual({ ok: true, outcome, removedRecords: outcome === 'repaired' ? 2 : 0 })
    expect(publishInvalidation).toHaveBeenCalledWith('/workspace')
  })

  test('does not publish when the registry is already valid', async () => {
    const publishInvalidation = vi.fn()

    await expect(
      cleanupBranchWorkspaceRegistryRecords('/workspace', {
        cleanup: async () => ({ ok: true, outcome: 'unchanged', removedRecords: 0 }),
        publishInvalidation,
      }),
    ).resolves.toEqual({ ok: true, outcome: 'unchanged', removedRecords: 0 })
    expect(publishInvalidation).not.toHaveBeenCalled()
  })

  test('maps source failures to the stable cleanup error', async () => {
    await expect(
      cleanupBranchWorkspaceRegistryRecords('/workspace', {
        cleanup: async () => {
          throw new Error('private filesystem detail')
        },
        publishInvalidation: vi.fn(),
      }),
    ).resolves.toEqual({ ok: false, message: 'workspace.branch-workspace.cleanup-failed' })
  })
})
