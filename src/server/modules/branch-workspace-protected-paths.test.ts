import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { assertBranchWorkspaceFileMutationAllowed } from '#/server/modules/branch-workspace-protected-paths.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'

const ROOT = path.resolve('/workspace')
const BRANCH_PATH = path.join(ROOT, 'goblin-feature-auth')

describe('branch workspace protected paths', () => {
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
