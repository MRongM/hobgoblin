import { describe, expect, test, vi } from 'vitest'
import { readBranchWorkspaceCatalog } from '#/server/modules/branch-workspace-catalog-read.ts'
import { normalizeRemoteRepoId, parseRemoteRepoId } from '#/shared/remote-repo.ts'

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
  test.each([
    '/workspace',
    normalizeRemoteRepoId({ alias: 'example', remotePath: '/workspace' }),
    normalizeRemoteRepoId({ alias: 'example', remotePath: '/workspace', transport: 'wsl' }),
  ])('scopes persisted targets on %s while retaining external repository identity', async (rootId) => {
    const base = await readBranchWorkspaceCatalog(rootId, undefined, {
      readManifests: async () => ({ kind: 'missing' }),
      discoverDirectories: async () => [discovered],
    })
    if (base.kind !== 'ready') throw new Error('expected catalog')
    const target = base.manifests[0]!
    const remote = parseRemoteRepoId(rootId)
    const repositoryId = remote ? normalizeRemoteRepoId({ ...remote, remotePath: '/external/api' }) : '/external/api'
    const readManifests = vi.fn(async () => ({ kind: 'ready' as const, manifests: [target] }))
    const discoverDirectories = vi.fn(async () => [
      {
        ...discovered,
        members: [{ ...discovered.members[0]!, repositoryId }],
      },
    ])
    const result = await readBranchWorkspaceCatalog(rootId, undefined, {
      target: { branchWorkspaceId: target.id },
      readManifests,
      discoverDirectories,
    })
    expect(discoverDirectories).toHaveBeenCalledExactlyOnceWith(rootId, undefined, {}, [target.directoryName])
    expect(readManifests).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ manifests: [{ repositories: [{ repositoryId }] }] })
  })

  test.each([{ branchWorkspaceId: 'unpersisted' }, { branch: 'feature/one' }])(
    'keeps discovery for an unpersisted target %j',
    async (target) => {
      const discoverDirectories = vi.fn(async () => [discovered])
      const result = await readBranchWorkspaceCatalog('/workspace', undefined, {
        target,
        readManifests: async () => ({ kind: 'missing' }),
        discoverDirectories,
      })
      expect(discoverDirectories).toHaveBeenCalledExactlyOnceWith('/workspace', undefined, {}, undefined)
      expect(result).toMatchObject({ manifests: [{ branch: discovered.branch }] })
    },
  )

  test('keeps discovered directories visible with an explicit registry error', async () => {
    const result = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => ({ kind: 'invalid', message: 'workspace.branch-workspace.read-failed' }),
      discoverDirectories: async () => [discovered],
    })
    expect(result).toMatchObject({
      kind: 'ready',
      registryError: 'workspace.branch-workspace.read-failed',
      manifests: [{ path: discovered.path }],
    })
  })

  test('retains missing stored members alongside discovered members for repair or removal', async () => {
    const base = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => ({ kind: 'missing' }),
      discoverDirectories: async () => [discovered],
    })
    if (base.kind !== 'ready') throw new Error('expected catalog')
    const stored = base.manifests[0]!
    const missing = { ...stored.repositories[0]!, repositoryName: 'web', worktreePath: `${stored.path}/web` }
    const result = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => ({
        kind: 'ready',
        manifests: [{ ...stored, repositories: [...stored.repositories, missing] }],
      }),
      discoverDirectories: async () => [discovered],
    })
    expect(result).toMatchObject({
      kind: 'ready',
      manifests: [{ repositories: [{ repositoryName: 'api' }, { repositoryName: 'web' }] }],
    })
  })

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
