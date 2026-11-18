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

function registration(rootId: string) {
  return {
    id: 'saved-folder',
    rootId,
    directoryName: discovered.directoryName,
    path: discovered.path,
    branch: '',
    repositories: [],
    auxiliaryEntries: [],
  }
}

describe('branch workspace catalog', () => {
  test.each([
    '/workspace',
    normalizeRemoteRepoId({ alias: 'example', remotePath: '/workspace' }),
    normalizeRemoteRepoId({ alias: 'example', remotePath: '/workspace', transport: 'wsl' }),
  ])('scopes persisted targets on %s while retaining external repository identity', async (rootId) => {
    const target = registration(rootId)
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
    expect(discoverDirectories).toHaveBeenCalledExactlyOnceWith(
      rootId,
      undefined,
      { registeredDirectoryNames: [target.directoryName] },
      [target.directoryName],
    )
    expect(readManifests).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ manifests: [{ repositories: [{ repositoryId }] }] })
  })

  test.each([
    { kind: 'missing' as const },
    { kind: 'invalid' as const, message: 'workspace.branch-workspace.read-failed' },
  ])('returns the $kind registry state without discovering unregistered folders', async (registry) => {
    const discoverDirectories = vi.fn(async () => [discovered])
    const result = await readBranchWorkspaceCatalog('/workspace', undefined, {
      readManifests: async () => registry,
      discoverDirectories,
    })
    expect(result).toEqual(registry)
    expect(discoverDirectories).not.toHaveBeenCalled()
  })

  test('discovers stable runtime manifests without writing configuration', async () => {
    const dependencies = {
      readManifests: async () => ({ kind: 'ready' as const, manifests: [registration('/workspace')] }),
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
})
