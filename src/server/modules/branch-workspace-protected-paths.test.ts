import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { assertBranchWorkspaceFileMutationAllowed } from '#/server/modules/branch-workspace-protected-paths.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'

const ROOT = path.resolve('/workspace')
const BRANCH_PATH = path.join(ROOT, 'goblin-feature-auth')

describe('branch workspace protected paths', () => {
  test.each([{ worktreePath: ROOT, paths: [BRANCH_PATH] }])(
    'blocks deleting a registered managed root %#',
    async ({ worktreePath, paths }) => {
      await expect(
        assertBranchWorkspaceFileMutationAllowed(
          { rootId: ROOT, kind: 'delete', worktreePath, paths },
          dependencies(manifest(ROOT)),
        ),
      ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
    },
  )

  test.each(['delete', 'rename', 'move'] as const)(
    'allows member root %s without scanning workspace state',
    async (kind) => {
      const readManifests = vi.fn(async () => {
        throw new Error('unrelated registry unavailable')
      })
      await expect(
        assertBranchWorkspaceFileMutationAllowed(
          {
            rootId: ROOT,
            worktreePath: BRANCH_PATH,
            paths: [path.join(BRANCH_PATH, 'api')],
            kind,
            newName: 'renamed',
            targetDirPath: path.join(BRANCH_PATH, 'nested'),
          },
          { readManifests },
        ),
      ).resolves.toEqual({ ok: true })
      expect(readManifests).not.toHaveBeenCalled()
    },
  )

  test('does not scan the workspace for ordinary parent file mutations', async () => {
    const deps = dependencies(manifest(ROOT))
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        { rootId: ROOT, worktreePath: ROOT, kind: 'delete', paths: [path.join(ROOT, 'notes.txt')] },
        deps,
      ),
    ).resolves.toEqual({ ok: true })
    expect(deps.readManifests).not.toHaveBeenCalled()
  })

  test('allows released auxiliary roots to retain generic file actions', async () => {
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId: ROOT,
          kind: 'delete',
          worktreePath: BRANCH_PATH,
          paths: [path.join(BRANCH_PATH, 'README.md')],
        },
        dependencies(manifest(ROOT)),
      ),
    ).resolves.toEqual({ ok: true })
  })

  test('allows descendants and unmanaged roots to retain generic file actions', async () => {
    const deps = dependencies(manifest(ROOT))
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId: ROOT,
          kind: 'rename',
          worktreePath: BRANCH_PATH,
          paths: [path.join(BRANCH_PATH, 'api', 'src', 'app.ts')],
          newName: 'main.ts',
        },
        deps,
      ),
    ).resolves.toEqual({ ok: true })
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId: ROOT,
          kind: 'delete',
          worktreePath: BRANCH_PATH,
          paths: [path.join(BRANCH_PATH, 'notes.txt')],
        },
        deps,
      ),
    ).resolves.toEqual({ ok: true })
  })

  test('blocks rename and move destinations that would take a protected identity', async () => {
    const deps = dependencies(manifest(ROOT))
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId: ROOT,
          kind: 'rename',
          worktreePath: ROOT,
          paths: [path.join(ROOT, 'scratch')],
          newName: 'goblin-feature-auth',
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId: ROOT,
          kind: 'move',
          worktreePath: ROOT,
          paths: [path.join(ROOT, 'scratch', path.basename(BRANCH_PATH))],
          targetDirPath: ROOT,
        },
        deps,
      ),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
  })

  test('uses POSIX lexical identity for SSH branch workspaces', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/srv/workspace' })
    const remoteManifest = manifest(rootId, '/srv/workspace/goblin-feature-auth')

    await expect(
      assertBranchWorkspaceFileMutationAllowed(
        {
          rootId,
          kind: 'move',
          worktreePath: '/srv/workspace',
          paths: [`${remoteManifest.path}/../goblin-feature-auth`],
          targetDirPath: '/srv/workspace/tmp',
        },
        dependencies(remoteManifest),
      ),
    ).resolves.toEqual({ ok: false, message: 'branch-workspace.managed-path-protected' })
  })
})

function dependencies(item: BranchWorkspaceManifest) {
  return {
    readManifests: vi.fn(async () => ({ kind: 'ready' as const, manifests: [item] })),
  }
}

function manifest(rootId: string, workspacePath = BRANCH_PATH): BranchWorkspaceManifest {
  const pathApi = rootId.startsWith('ssh-config://') ? path.posix : path
  const rootPath = rootId.startsWith('ssh-config://') ? '/srv/workspace' : ROOT
  return {
    id: 'branch-1',
    rootId,
    branch: 'feature/auth',
    directoryName: 'goblin-feature-auth',
    path: workspacePath,
    repositories: [
      {
        repositoryName: 'api',
        targetBranch: 'feature/auth',
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: false,
        branchOrigin: 'created',
        worktreePath: pathApi.join(workspacePath, 'api'),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [
      {
        name: 'README.md',
        mode: 'copy',
        sourcePath: pathApi.join(rootPath, 'README.md'),
        targetPath: pathApi.join(workspacePath, 'README.md'),
        progress: 'complete',
      },
    ],
  }
}
