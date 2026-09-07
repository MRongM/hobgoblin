import path from 'node:path'
import { mkdir, mkdtemp, rm, access, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execa } from 'execa'
import { describe, expect, test, vi } from 'vitest'
import { discoverBranchWorkspaceDirectories } from '#/server/modules/branch-workspace-discovery-source.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'
import { readBranchWorkspaceSnapshot } from '#/server/modules/branch-workspace-read.ts'
import { createBranchWorkspaceWriteService } from '#/server/modules/branch-workspace-write-paths.ts'
import {
  readBranchWorkspaceManifests,
  updateBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'

const ROOT = path.resolve('/workspace')

describe('branch workspace discovery source', () => {
  test('detects and removes a real manual workspace without a saved workspace config', async () => {
    const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'branch-workspace-discovery-')))
    try {
      const root = path.join(temporaryRoot, 'workspace')
      const primary = path.join(temporaryRoot, 'repository')
      const branchRoot = path.join(root, 'hob-manual')
      const memberPath = path.join(branchRoot, 'api')
      await mkdir(branchRoot, { recursive: true })
      await execa('git', ['init', '-b', 'main', primary])
      await execa('git', [
        '-C',
        primary,
        '-c',
        'user.name=Developer',
        '-c',
        'user.email=developer@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'Fixture',
      ])
      await execa('git', ['-C', primary, 'worktree', 'add', '-b', 'feature/manual', memberPath])
      const dataFile = path.join(temporaryRoot, 'registry.json')
      const readManifests = async (rootId: string) => readBranchWorkspaceManifests(rootId, { dataFile })
      const readConfig = async () => ({ kind: 'missing' as const })
      const read = await readBranchWorkspaceSnapshot(root, undefined, { readManifests, readConfig })
      expect(read).toMatchObject({
        ok: true,
        items: [{ available: true, repositories: [{ repositoryId: primary, ready: true }] }],
      })
      if (!read.ok || !read.items[0]) throw new Error('expected manual workspace')
      await expect(access(dataFile)).rejects.toThrow()
      const service = createBranchWorkspaceWriteService({
        readManifests,
        updateManifests: async (rootId, mutate) => updateBranchWorkspaceManifests(rootId, mutate, { dataFile }),
        planDependencies: { readManifests, readConfig },
        publishInvalidation: () => {},
      })
      const planned = await service.plan(root, {
        operation: 'remove',
        branchWorkspaceId: read.items[0].id,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      })
      expect(planned.ok).toBe(true)
      if (!planned.ok) throw new Error(planned.message)
      expect(planned.plan.repositories[0]?.repoId).toBe(primary)
      const removed = await service.execute(root, {
        planToken: planned.plan.token,
        approvals: planned.plan.requiredApprovals,
      })
      expect(removed.ok).toBe(true)
      await expect(access(branchRoot)).rejects.toThrow()
      await expect(access(primary)).resolves.toBeUndefined()
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
  test('discovers a manually created prefixed directory from registered child worktrees', async () => {
    const listChildren = vi.fn(async (_rootId: string, targetPath: string) =>
      targetPath === ROOT ? ['api', 'hob-manual'] : targetPath.endsWith('hob-manual') ? ['api'] : [],
    )
    const inspectPath = vi.fn(async (_rootId: string, candidatePath: string) => ({
      path: candidatePath,
      exists: true,
      kind: 'directory' as const,
      resolvedPath: candidatePath,
      directChild: path.dirname(candidatePath) === ROOT,
      outsideRoot: false,
    }))
    const getWorktrees = vi.fn(async (repoPath: string) =>
      repoPath.endsWith(`${path.sep}hob-manual${path.sep}api`)
        ? [
            {
              path: repoPath,
              branch: 'feature/manual',
              isBare: false,
              isPrimary: false,
            },
          ]
        : [],
    )

    await expect(
      discoverBranchWorkspaceDirectories(ROOT, undefined, { listChildren, inspectPath, getWorktrees }),
    ).resolves.toMatchObject([
      {
        directoryName: 'hob-manual',
        path: path.join(ROOT, 'hob-manual'),
        branch: 'feature/manual',
        members: [
          {
            repositoryName: 'api',
            worktreePath: path.join(ROOT, 'hob-manual', 'api'),
            branch: 'feature/manual',
          },
        ],
      },
    ])
  })

  test('accepts legacy prefixes and ignores ordinary or empty directories', async () => {
    const listChildren = vi.fn(async (_rootId: string, targetPath: string) => {
      if (targetPath === ROOT) return ['goblin-old', 'hobgoblin-new', 'ordinary', 'hob-empty']
      if (targetPath.endsWith('goblin-old')) return ['api']
      if (targetPath.endsWith('hobgoblin-new')) return ['web']
      return []
    })
    const inspectPath = vi.fn(async (_rootId: string, candidatePath: string) => ({
      path: candidatePath,
      exists: true,
      kind: 'directory' as const,
      resolvedPath: candidatePath,
      directChild: true,
      outsideRoot: false,
    }))
    const getWorktrees = vi.fn(async (repoPath: string) =>
      repoPath.endsWith(`${path.sep}api`) || repoPath.endsWith(`${path.sep}web`)
        ? [{ path: repoPath, branch: 'feature/shared', isBare: false, isPrimary: false }]
        : [],
    )

    await expect(
      discoverBranchWorkspaceDirectories(ROOT, undefined, { listChildren, inspectPath, getWorktrees }),
    ).resolves.toMatchObject([
      { directoryName: 'goblin-old', branch: 'feature/shared' },
      { directoryName: 'hobgoblin-new', branch: 'feature/shared' },
    ])
  })

  test('probes a member on its SSH host and derives its primary repository identity', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/workspace' })
    const memberId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/workspace/hob-manual/api' })
    const primaryId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/repositories/api' })
    const getWorktrees = vi.fn(async () => [
      { path: '/repositories/api', branch: 'main', isBare: false, isPrimary: true },
      { path: '/workspace/hob-manual/api', branch: 'feature/manual', isBare: false, isPrimary: false },
    ])
    const result = await discoverBranchWorkspaceDirectories(rootId, undefined, {
      listChildren: async (_rootId, target) => (target === '/workspace' ? ['hob-manual'] : ['api']),
      inspectPath: async (_rootId, candidatePath) => ({
        path: candidatePath,
        exists: true,
        kind: 'directory',
        directChild: true,
        outsideRoot: false,
      }),
      getWorktrees,
    })
    expect(getWorktrees).toHaveBeenCalledWith(memberId, undefined)
    expect(result[0]?.members[0]).toMatchObject({ repositoryId: primaryId })
  })
})
