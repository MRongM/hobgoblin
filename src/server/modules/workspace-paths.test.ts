import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  branchWorkspaceDirectoryName,
  branchWorkspacePath,
  workspacePathExists,
  workspaceRepositoryId,
  workspaceRepositoryPath,
  workspaceRootId,
  workspaceWorktreePath,
} from '#/server/modules/workspace-paths.ts'
import { normalizeRemoteRepoId, normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import type { RemoteCommandResult } from '#/system/ssh/commands.ts'

describe('workspace paths', () => {
  test('uses a readable slug and deterministic collision hash', () => {
    const first = branchWorkspaceDirectoryName('feature/auth', new Set())
    const collision = branchWorkspaceDirectoryName('feature/auth', new Set([first]))

    expect(first).toBe('goblin-feature-auth')
    expect(collision).toMatch(/^goblin-feature-auth-[a-f0-9]{8}$/)
    expect(branchWorkspaceDirectoryName('feature/auth', new Set([first]))).toBe(collision)
    expect(branchWorkspaceDirectoryName('修复 登录', new Set())).toBe('goblin-branch')
  })

  test('extends the deterministic hash when a shorter collision candidate is occupied', () => {
    const first = branchWorkspaceDirectoryName('feature/auth', new Set())
    const second = branchWorkspaceDirectoryName('feature/auth', new Set([first]))
    const third = branchWorkspaceDirectoryName('feature/auth', new Set([first, second]))

    expect(third).toMatch(/^goblin-feature-auth-[a-f0-9]{12}$/)
  })

  test('joins branch workspace paths on the parent host', () => {
    const localRoot = path.resolve('/workspace')
    const remoteRoot = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/srv/workspace' })

    expect(branchWorkspacePath(localRoot, 'goblin-feature-auth')).toBe(path.join(localRoot, 'goblin-feature-auth'))
    expect(branchWorkspacePath(remoteRoot, 'goblin-feature-auth')).toBe('/srv/workspace/goblin-feature-auth')
    expect(() => branchWorkspacePath(localRoot, '../escape')).toThrow('workspace.branch-workspace.invalid-directory')
  })

  test('uses platform paths for local workspace repositories', () => {
    const root = path.resolve('/workspace')
    const repository = path.join(root, 'api')

    expect(workspaceRootId(root)).toBe(root)
    expect(workspaceRepositoryId(root, 'api')).toBe(repository)
    expect(workspaceRepositoryPath(repository)).toBe(repository)
    expect(workspaceWorktreePath(repository, 'feature/remote')).toBe(path.join(root, 'api-feature-remote'))
  })

  test('keeps remote ids opaque while deriving POSIX repository and worktree paths', () => {
    const root = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })
    const repository = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace/api' })

    expect(workspaceRootId(root)).toBe(root)
    expect(workspaceRepositoryId(root, 'api')).toBe(repository)
    expect(workspaceRepositoryPath(repository)).toBe('/srv/workspace/api')
    expect(workspaceWorktreePath(repository, 'feature/remote')).toBe('/srv/workspace/api-feature-remote')
  })

  test('rejects unsafe members and malformed remote repository ids', () => {
    const root = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })

    expect(workspaceRepositoryId(root, '../api')).toBeNull()
    expect(workspaceRepositoryPath('ssh-config://broken')).toBeNull()
    expect(workspaceWorktreePath('ssh-config://broken', 'feature/a')).toBeNull()
  })

  test('checks remote worktree path existence on the repository SSH target', async () => {
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace/api',
    })!
    const runRemote = vi.fn(
      async (): Promise<RemoteCommandResult> => ({
        ok: true,
        stdout: '__HOBGOBLIN_PATH_EXISTS__',
        stderr: '',
      }),
    )

    await expect(
      workspacePathExists(target.id, '/srv/workspace/api-feature', {
        resolveRemoteTarget: async () => target,
        runRemote,
      }),
    ).resolves.toBe(true)
    expect(runRemote).toHaveBeenCalledWith(target, {
      type: 'testPathExists',
      path: '/srv/workspace/api-feature',
    })

    runRemote.mockResolvedValueOnce({ ok: true, stdout: '__HOBGOBLIN_PATH_MISSING__', stderr: '' })
    await expect(
      workspacePathExists(target.id, '/srv/workspace/api-missing', {
        resolveRemoteTarget: async () => target,
        runRemote,
      }),
    ).resolves.toBe(false)

    runRemote.mockResolvedValueOnce({ ok: false, stdout: '', stderr: '', message: 'timeout', timedOut: true })
    await expect(
      workspacePathExists(target.id, '/srv/workspace/api-unknown', {
        resolveRemoteTarget: async () => target,
        runRemote,
      }),
    ).rejects.toThrow('timeout')
  })
})
