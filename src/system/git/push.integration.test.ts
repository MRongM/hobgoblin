import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, test } from 'vitest'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import { git } from '#/system/git/helper.ts'
import { pushBranch } from '#/system/git/remote.ts'
import { buildRemoteCommandInvocation } from '#/system/ssh/commands.ts'
import { pushRemoteBranch } from '#/system/ssh/git.ts'

const directories: string[] = []
const branch = 'feature/test'

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function configureRepository(directory: string) {
  await git(directory, ['config', 'user.name', 'Test User'])
  await git(directory, ['config', 'user.email', 'test@example.invalid'])
  await git(directory, ['config', 'commit.gpgSign', 'false'])
  await git(directory, ['config', 'core.hooksPath', path.join(directory, '.empty-hooks')])
}

async function createRepositories() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'hobgoblin-push-test-')))
  directories.push(directory)
  const receiver = path.join(directory, 'receiver')
  const sender = path.join(directory, 'sender')
  await fs.mkdir(receiver)
  await git(receiver, ['init', `--initial-branch=${branch}`])
  await configureRepository(receiver)
  await git(receiver, ['config', 'receive.denyCurrentBranch', 'refuse'])
  await fs.writeFile(path.join(receiver, 'tracked.txt'), 'initial\n')
  await git(receiver, ['add', 'tracked.txt'])
  await git(receiver, ['commit', '-m', 'initial'])
  await git(directory, ['clone', '--no-hardlinks', receiver, sender])
  await configureRepository(sender)
  await fs.writeFile(path.join(sender, 'tracked.txt'), 'committed\n')
  await fs.writeFile(path.join(sender, 'added.txt'), 'committed addition\n')
  await git(sender, ['add', 'tracked.txt', 'added.txt'])
  await git(sender, ['commit', '-m', 'committed update'])
  return { receiver, sender, directory }
}

async function snapshot(directory: string) {
  return await Promise.all([
    git(directory, ['rev-parse', 'HEAD']),
    git(directory, ['status', '--porcelain']),
    git(directory, ['diff', '--cached', '--binary']),
    git(directory, ['diff', '--binary']),
    git(directory, ['config', '--local', '--list']),
  ])
}

async function push(sender: string, transport: 'local' | 'SSH') {
  if (transport === 'local') return await pushBranch(sender, branch)
  const target = normalizeRemoteTarget({
    alias: 'test-host',
    host: 'example.invalid',
    user: 'test',
    port: 22,
    remotePath: sender,
  })!
  return await pushRemoteBranch(target, branch, {
    run: async (command, remote, options) => {
      const { script } = buildRemoteCommandInvocation(remote, command)
      const result = await execa('sh', ['-c', script], {
        reject: false,
        cancelSignal: options?.signal,
        timeout: options?.timeoutMs,
      })
      return { ok: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr, message: result.stderr }
    },
  })
}

describe.each(['local', 'SSH'] as const)('%s branch push', (transport) => {
  test('updates a clean checked-out receiver while preserving every sender change and receiver config', async () => {
    const { receiver, sender } = await createRepositories()
    await fs.writeFile(path.join(sender, 'tracked.txt'), 'staged\n')
    await git(sender, ['add', 'tracked.txt'])
    await fs.writeFile(path.join(sender, 'tracked.txt'), 'unstaged\n')
    await fs.writeFile(path.join(sender, 'untracked.txt'), 'untracked\n')
    const before = await snapshot(sender)
    const receiverConfig = await git(receiver, ['config', '--local', '--list'])

    expect(await push(sender, transport)).toMatchObject({ ok: true })

    expect(await git(receiver, ['rev-parse', 'HEAD'])).toBe(await git(sender, ['rev-parse', 'HEAD']))
    expect(await fs.readFile(path.join(receiver, 'tracked.txt'), 'utf8')).toBe('committed\n')
    expect(await fs.readFile(path.join(receiver, 'added.txt'), 'utf8')).toBe('committed addition\n')
    expect(await git(receiver, ['status', '--porcelain'])).toBe('')
    expect(await git(receiver, ['config', '--local', '--list'])).toBe(receiverConfig)
    expect(await snapshot(sender)).toEqual(before)
    expect(await fs.readFile(path.join(sender, 'untracked.txt'), 'utf8')).toBe('untracked\n')
  }, 15_000)

  test('updates the target branch checked out in a receiver linked worktree', async () => {
    const { receiver, sender, directory } = await createRepositories()
    await git(receiver, ['switch', '-c', 'other'])
    const linked = path.join(directory, 'receiver-linked')
    await git(receiver, ['worktree', 'add', linked, branch])
    const otherHead = await git(receiver, ['rev-parse', 'HEAD'])

    expect(await push(sender, transport)).toMatchObject({ ok: true })

    expect(await git(linked, ['rev-parse', 'HEAD'])).toBe(await git(sender, ['rev-parse', 'HEAD']))
    expect(await fs.readFile(path.join(linked, 'tracked.txt'), 'utf8')).toBe('committed\n')
    expect(await git(linked, ['status', '--porcelain'])).toBe('')
    expect(await git(receiver, ['rev-parse', 'HEAD'])).toBe(otherHead)
  }, 15_000)

  test('sets the upstream after recovering a push without an existing upstream', async () => {
    const { receiver, sender } = await createRepositories()
    await git(sender, ['branch', '--unset-upstream', branch])

    expect(await push(sender, transport)).toMatchObject({ ok: true })

    expect(await git(sender, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])).toBe(`origin/${branch}`)
    expect(await git(receiver, ['rev-parse', 'HEAD'])).toBe(await git(sender, ['rev-parse', 'HEAD']))
  }, 15_000)

  test('recovers colored checked-out branch diagnostics', async () => {
    const { receiver, sender } = await createRepositories()
    await git(sender, ['config', 'color.transport', 'always'])

    expect(await push(sender, transport)).toMatchObject({ ok: true })

    expect(await git(receiver, ['rev-parse', 'HEAD'])).toBe(await git(sender, ['rev-parse', 'HEAD']))
  }, 15_000)

  test('keeps unrelated receiver untracked files while updating committed history', async () => {
    const { receiver, sender } = await createRepositories()
    await fs.writeFile(path.join(receiver, 'unrelated.txt'), 'receiver file\n')

    expect(await push(sender, transport)).toMatchObject({ ok: true })

    expect(await fs.readFile(path.join(receiver, 'unrelated.txt'), 'utf8')).toBe('receiver file\n')
    expect(await git(receiver, ['rev-parse', 'HEAD'])).toBe(await git(sender, ['rev-parse', 'HEAD']))
  }, 15_000)

  test.each(['staged', 'unstaged', 'untracked collision'] as const)(
    'preserves the receiver when it has %s changes',
    async (state) => {
      const { receiver, sender } = await createRepositories()
      const filename = state === 'untracked collision' ? 'added.txt' : 'tracked.txt'
      await fs.writeFile(path.join(receiver, filename), 'receiver changes\n')
      if (state === 'staged') await git(receiver, ['add', filename])
      const receiverBefore = await snapshot(receiver)
      const senderBefore = await snapshot(sender)

      expect(await push(sender, transport)).toMatchObject({ ok: false })

      expect(await snapshot(receiver)).toEqual(receiverBefore)
      expect(await snapshot(sender)).toEqual(senderBefore)
      expect(await fs.readFile(path.join(receiver, filename), 'utf8')).toBe('receiver changes\n')
    },
    15_000,
  )

  test('preserves a diverged receiver branch instead of force pushing', async () => {
    const { receiver, sender } = await createRepositories()
    await fs.writeFile(path.join(receiver, 'remote.txt'), 'remote commit\n')
    await git(receiver, ['add', 'remote.txt'])
    await git(receiver, ['commit', '-m', 'receiver commit'])
    const receiverBefore = await snapshot(receiver)

    expect(await push(sender, transport)).toMatchObject({ ok: false })

    expect(await snapshot(receiver)).toEqual(receiverBefore)
  }, 15_000)

  test('does not rerun a rejecting hook that mentions the checked-out branch diagnostic', async () => {
    const { receiver, sender } = await createRepositories()
    const hooks = path.join(receiver, '.empty-hooks')
    await fs.mkdir(hooks)
    await fs.writeFile(
      path.join(hooks, 'pre-receive'),
      [
        '#!/bin/sh',
        "printf 'called\\n' >> hook-calls",
        "printf '%s\\n' 'refusing to update checked out branch: policy explanation' >&2",
        'exit 1',
      ].join('\n') + '\n',
      { mode: 0o755 },
    )

    expect(await push(sender, transport)).toMatchObject({ ok: false })

    expect(await fs.readFile(path.join(receiver, '.git', 'hook-calls'), 'utf8')).toBe('called\n')
  }, 15_000)
})
