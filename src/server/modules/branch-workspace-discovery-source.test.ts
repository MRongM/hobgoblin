import path from 'node:path'
import { mkdir, mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { discoverBranchWorkspaceDirectories } from '#/server/modules/branch-workspace-discovery-source.ts'
import { normalizeRemoteRepoId, normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const temporaryRoots: string[] = []

async function folderFixture(name: string) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'folder-discovery-')))
  temporaryRoots.push(root)
  await mkdir(path.join(root, name, 'api'), { recursive: true })
  return root
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('branch workspace discovery source', () => {
  test('limits target discovery without enumerating or probing sibling workspaces', async () => {
    const root = await folderFixture('hob-one')
    const listChildren = vi.fn(async () => ['api'])
    const inspectPath = vi.fn(async (_root: string, candidatePath: string) => ({
      path: candidatePath,
      exists: true,
      kind: 'directory' as const,
      directChild: true,
      outsideRoot: false,
    }))
    const getWorktrees = vi.fn(async (memberPath: string) =>
      path.basename(memberPath) === 'api'
        ? [
            { path: path.join(root, 'external-repository'), isPrimary: true, isBare: false },
            { path: memberPath, branch: 'feature/one', isPrimary: false, isBare: false },
          ]
        : [],
    )
    const result = await discoverBranchWorkspaceDirectories(
      root,
      undefined,
      { listChildren, inspectPath, getWorktrees },
      ['hob-one'],
    )
    expect(result).toMatchObject([
      { directoryName: 'hob-one', members: [{ repositoryId: path.join(root, 'external-repository') }] },
    ])
    expect(listChildren).toHaveBeenCalledExactlyOnceWith(root, path.join(root, 'hob-one'), undefined)
    expect(getWorktrees.mock.calls.map(([candidate]) => candidate)).toEqual([
      path.join(root, 'hob-one'),
      path.join(root, 'hob-one', 'api'),
    ])
  })

  test('probes a member on its SSH host and derives its primary repository identity', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/workspace' })
    const primaryId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/repositories/api' })
    const target = normalizeRemoteTarget({
      alias: 'dev',
      host: 'example.com',
      user: 'developer',
      port: 22,
      remotePath: '/workspace',
    })!
    const resolveRemoteTarget = vi.fn(async () => ({ target }))
    const discoverRemote = vi.fn(async () => [
      {
        directoryName: 'hob-manual',
        path: '/workspace/hob-manual',
        branch: 'feature/manual',
        members: [
          {
            repositoryName: 'api',
            repositoryPath: '/repositories/api',
            worktreePath: '/workspace/hob-manual/api',
            branch: 'feature/manual',
          },
        ],
      },
    ])
    const getWorktrees = vi.fn(async () => [])
    const listChildren = vi.fn(async () => [])
    const signal = new AbortController().signal
    const result = await discoverBranchWorkspaceDirectories(rootId, signal, {
      resolveRemoteTarget,
      discoverRemote,
      listChildren,
      getWorktrees,
    })
    expect(resolveRemoteTarget).toHaveBeenCalledTimes(1)
    expect(discoverRemote).toHaveBeenCalledExactlyOnceWith(target, '/workspace', { signal })
    expect(listChildren).not.toHaveBeenCalled()
    expect(getWorktrees).not.toHaveBeenCalled()
    expect(result[0]?.members[0]).toMatchObject({ repositoryId: primaryId })
  })
})

describe('registered folder discovery', () => {
  test('probes an explicit arbitrary folder and distinguishes complete detached repositories', async () => {
    const root = await folderFixture('feature set')
    const memberPath = path.join(root, 'feature set', 'api')
    const result = await discoverBranchWorkspaceDirectories(
      root,
      undefined,
      {
        listChildren: async () => ['api'],
        inspectPath: async (_root, candidatePath) => ({
          path: candidatePath,
          exists: true,
          kind: 'directory',
          directChild: true,
          outsideRoot: false,
        }),
        getWorktrees: async () => [
          { path: memberPath, isBare: false, isPrimary: true, isDetached: true, head: 'abcdef123' },
        ],
      },
      ['feature set'],
    )
    expect(result).toMatchObject([
      {
        directoryName: 'feature set',
        members: [{ kind: 'repository', repositoryId: memberPath, branch: '', head: 'abcdef123' }],
      },
    ])
  })
})
