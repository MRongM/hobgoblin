import path from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  broadcastRendererEffectIntent: vi.fn(),
}))

vi.mock('#/main/renderer-surface-events.ts', () => ({
  broadcastRendererEffectIntent: mocks.broadcastRendererEffectIntent,
}))

describe('external open queue', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('queues safe paths once and drains them in order', async () => {
    const { consumeExternalOpenPaths, enqueueExternalOpenPath } = await import('#/main/external-open.ts')
    const repoA = path.resolve('/tmp/repo-a')
    const repoB = path.resolve('/tmp/repo-b')

    expect(enqueueExternalOpenPath(repoA)).toBe(true)
    expect(enqueueExternalOpenPath(repoA)).toBe(false)
    expect(enqueueExternalOpenPath(repoB)).toBe(true)
    expect(enqueueExternalOpenPath('')).toBe(false)

    expect(mocks.broadcastRendererEffectIntent).toHaveBeenCalledTimes(2)
    expect(consumeExternalOpenPaths()).toEqual([repoA, repoB])
    expect(consumeExternalOpenPaths()).toEqual([])
  })
})
