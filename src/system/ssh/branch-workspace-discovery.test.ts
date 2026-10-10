import path from 'node:path'
import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execa } from 'execa'
import { describe, expect, test, vi } from 'vitest'
import { buildRemoteCommandInvocation, type RemoteCommandKind } from '#/system/ssh/commands.ts'
import * as remote from '#/system/ssh/branch-workspaces.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const TARGET = normalizeRemoteTarget({
  alias: 'dev',
  host: 'example.com',
  user: 'developer',
  port: 22,
  remotePath: '/workspace',
})!

describe('remote branch workspace discovery', () => {
  test.skipIf(process.platform === 'win32')(
    'discovers exact registered members in one command, excluding links and detached worktrees',
    async () => {
      const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'workspace-discovery-')))
      try {
        const root = path.join(temporary, "workspace's files")
        const primary = path.join(temporary, 'repository')
        await mkdir(root)
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
        for (const [directory, branch] of [
          ['hob-one', 'feature/one'],
          ['goblin-two', 'feature/two'],
        ]) {
          await execa('git', ['-C', primary, 'worktree', 'add', '-b', branch!, path.join(root, directory!, 'api')])
        }
        await execa('git', ['-C', primary, 'worktree', 'add', '--detach', path.join(root, 'hob-detached', 'api')])
        await symlink(path.join(root, 'hob-one'), path.join(root, 'hob-linked'))
        await symlink(path.join(root, 'hob-one', 'api'), path.join(root, 'hob-one', 'linked'))
        await mkdir(path.join(root, 'hob-one', 'ordinary'))
        const run = vi.fn(async (command: RemoteCommandKind) => {
          const invocation = buildRemoteCommandInvocation(TARGET, command)
          const result = await execa('sh', ['-c', invocation.script])
          return { ok: true, stdout: result.stdout, stderr: result.stderr }
        })
        const discovered = await remote.discoverRemoteBranchWorkspaceDirectories(TARGET, root, { run })
        expect(run).toHaveBeenCalledTimes(1)
        expect(discovered.map((item) => item.directoryName)).toEqual(['goblin-two', 'hob-one'])
        expect(discovered[1]?.members).toEqual([
          {
            repositoryName: 'api',
            repositoryPath: primary,
            worktreePath: path.join(root, 'hob-one', 'api'),
            branch: 'feature/one',
          },
        ])
        run.mockClear()
        const scoped = await remote.discoverRemoteBranchWorkspaceDirectories(TARGET, root, {
          run,
          directoryNames: ['hob-one'],
        })
        expect(run).toHaveBeenCalledTimes(1)
        expect(scoped).toEqual([discovered[1]])
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    },
  )

  test('rejects discovered paths outside their declared parent', async () => {
    const run = vi.fn(async () => ({
      ok: true,
      stderr: '',
      stdout: JSON.stringify({
        ok: true,
        directories: [{ directoryName: 'hob-one', path: '/elsewhere/hob-one', branch: 'feature/one', members: [] }],
      }),
    }))
    await expect(remote.discoverRemoteBranchWorkspaceDirectories(TARGET, '/workspace', { run })).rejects.toThrow(
      'remote-invalid-response',
    )
  })

  test('cancels before sending discovery and after the response', async () => {
    const controller = new AbortController()
    const run = vi.fn(async () => {
      controller.abort()
      return { ok: true, stderr: '', stdout: '{"ok":true,"directories":[]}' }
    })
    await expect(
      remote.discoverRemoteBranchWorkspaceDirectories(TARGET, '/workspace', { signal: controller.signal, run }),
    ).rejects.toThrow('cancelled')
    await expect(
      remote.discoverRemoteBranchWorkspaceDirectories(TARGET, '/workspace', { signal: controller.signal, run }),
    ).rejects.toThrow('cancelled')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
