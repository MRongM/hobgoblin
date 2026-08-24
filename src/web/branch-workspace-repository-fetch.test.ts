import { describe, expect, test, vi } from 'vitest'
import {
  fetchBranchWorkspaceRepositories,
  type BranchWorkspaceRepositoryFetchTarget,
} from '#/web/branch-workspace-repository-fetch.ts'

const targets: BranchWorkspaceRepositoryFetchTarget[] = [
  { id: '/workspace/api', name: 'api' },
  { id: '/workspace/web', name: 'web' },
  { id: '/workspace/docs', name: 'docs' },
]

describe('branch workspace repository fetch', () => {
  test('starts every repository sync before waiting for any repository to finish', async () => {
    const started: string[] = []
    const releases: Array<() => void> = []
    const syncRepository = vi.fn(async (target: BranchWorkspaceRepositoryFetchTarget) => {
      started.push(target.name)
      await new Promise<void>((resolve) => releases.push(resolve))
      return { ok: true as const, message: `fetched ${target.name}` }
    })

    const work = fetchBranchWorkspaceRepositories(targets, syncRepository)

    expect(started).toEqual(['api', 'web', 'docs'])
    releases.forEach((release) => release())
    await expect(work).resolves.toEqual({ total: 3, succeeded: 3, failures: [] })
  })

  test('collects returned and thrown failures without stopping other repositories', async () => {
    const completed: string[] = []
    const syncRepository = vi.fn(async (target: BranchWorkspaceRepositoryFetchTarget) => {
      if (target.name === 'api') return { ok: false as const, message: 'offline' }
      if (target.name === 'web') throw new Error('transport closed')
      completed.push(target.name)
      return { ok: true as const, message: 'fetched' }
    })

    await expect(fetchBranchWorkspaceRepositories(targets, syncRepository)).resolves.toEqual({
      total: 3,
      succeeded: 1,
      failures: [
        { repositoryName: 'api', message: 'offline' },
        { repositoryName: 'web', message: 'transport closed' },
      ],
    })
    expect(completed).toEqual(['docs'])
    expect(syncRepository).toHaveBeenCalledTimes(3)
  })

  test('reports a repository that could not start as busy', async () => {
    await expect(fetchBranchWorkspaceRepositories([targets[0]!], async () => null)).resolves.toEqual({
      total: 1,
      succeeded: 0,
      failures: [{ repositoryName: 'api', message: 'error.network-op-in-progress' }],
    })
  })
})
