import { describe, expect, test } from 'vitest'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'

const discovered = {
  directoryName: 'hob-manual',
  path: '/workspace/hob-manual',
  branch: 'feature/one',
  members: [
    {
      repositoryName: 'api',
      repositoryId: '/workspace/api',
      worktreePath: '/workspace/hob-manual/api',
      branch: 'feature/one',
    },
  ],
}

describe('branch workspace catalog', () => {
  test('discovers stable runtime manifests without writing configuration', async () => {
    const dependencies = {
      readManifests: async () => ({ kind: 'missing' as const }),
      discoverDirectories: async () => [discovered],
    }
    const first = await readBranchWorkspaceCatalog('/workspace', undefined, dependencies)
    const second = await readBranchWorkspaceCatalog('/workspace', undefined, dependencies)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      kind: 'ready',
      manifests: [
        {
          path: discovered.path,
          repositories: [{ repositoryName: 'api', repositoryId: '/workspace/api', progress: 'complete' }],
        },
      ],
    })
  })

  test('uses physical members and branches while preserving stored identity and operation progress', async () => {
    const base = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => ({ kind: 'missing' }),
      discoverDirectories: async () => [discovered],
    })
    if (base.kind !== 'ready') throw new Error('expected catalog')
    const stored = base.manifests[0]!
    const readManifests = async () => ({ kind: 'ready' as const, manifests: [{ ...stored, id: 'retained-id' }] })
    const changed = { ...discovered, members: [{ ...discovered.members[0]!, branch: 'feature/switched' }] }
    const result = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests,
      discoverDirectories: async () => [changed],
    })
    expect(result).toMatchObject({
      kind: 'ready',
      manifests: [
        {
          id: 'retained-id',
          repositories: [{ targetBranch: 'feature/switched', branchOrigin: 'pre-existing' }],
        },
      ],
    })

    const deleting = {
      ...stored,
      operation: { kind: 'remove' as const },
      repositories: [{ ...stored.repositories[0]!, progress: 'removed' as const }],
    }
    const progress = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => ({ kind: 'ready', manifests: [deleting] }),
      discoverDirectories: async () => [discovered],
    })
    expect(progress).toMatchObject({
      kind: 'ready',
      manifests: [{ operation: { kind: 'remove' }, repositories: [{ progress: 'removed' }] }],
    })
  })
})
