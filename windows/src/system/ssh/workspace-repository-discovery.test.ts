import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, test } from 'vitest'
import { buildRemoteCommandInvocation } from '#/system/ssh/commands.ts'
import { normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const target = normalizeRemoteTarget({
  alias: 'test-host',
  host: 'example.com',
  user: 'developer',
  port: 22,
  remotePath: '/workspace',
})!

const temporaryRoots: string[] = []

async function createRepositoryWithLinkedWorktree(workspaceRoot: string) {
  const repository = path.join(workspaceRoot, 'api')
  const linkedWorktree = path.join(workspaceRoot, 'api-feature')
  await execa('git', ['init', repository])
  await writeFile(path.join(repository, 'README.md'), 'workspace repository\n')
  await execa('git', ['-C', repository, 'add', 'README.md'])
  await execa('git', [
    '-C',
    repository,
    '-c',
    'user.name=Test User',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-m',
    'Initial commit',
  ])
  await execa('git', ['-C', repository, 'worktree', 'add', '-b', 'feature/test', linkedWorktree])
  return { repository, linkedWorktree }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SSH workspace repository discovery script', () => {
  test('lists the primary worktree without listing a linked worktree', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'hobgoblin-ssh-workspace-repositories-'))
    temporaryRoots.push(temporaryRoot)
    const workspaceRoot = path.join(temporaryRoot, 'workspace')
    await mkdir(workspaceRoot)
    const { repository, linkedWorktree } = await createRepositoryWithLinkedWorktree(workspaceRoot)

    const discovery = buildRemoteCommandInvocation(target, {
      type: 'listWorkspaceGitDirectories',
      rootPath: workspaceRoot,
    })
    const result = await execa('sh', ['-c', discovery.script])

    expect(result.stdout.split('\0').filter(Boolean)).toEqual([repository])

    const primaryValidation = buildRemoteCommandInvocation(target, {
      type: 'testWorkspaceGitDirectory',
      path: repository,
    })
    await expect(execa('sh', ['-c', primaryValidation.script])).resolves.toMatchObject({ exitCode: 0 })

    const linkedValidation = buildRemoteCommandInvocation(target, {
      type: 'testWorkspaceGitDirectory',
      path: linkedWorktree,
    })
    await expect(execa('sh', ['-c', linkedValidation.script])).rejects.toMatchObject({
      exitCode: 1,
      stdout: '__HOBGOBLIN_WORKSPACE_LINKED_WORKTREE__',
    })
  })

  test('omits configured repository worktrees from branch workspace auxiliary candidates', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'hobgoblin-ssh-branch-auxiliary-'))
    temporaryRoots.push(temporaryRoot)
    const workspaceRoot = path.join(temporaryRoot, 'workspace')
    const docs = path.join(workspaceRoot, 'docs')
    await mkdir(workspaceRoot)
    await mkdir(docs)
    await createRepositoryWithLinkedWorktree(workspaceRoot)

    const discovery = buildRemoteCommandInvocation(target, {
      type: 'listBranchWorkspaceCandidates',
      rootPath: workspaceRoot,
      excludedNames: ['api'],
    })
    const result = await execa('sh', ['-c', discovery.script])

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      candidates: [{ name: 'docs', path: docs, kind: 'directory', outsideRoot: false }],
    })
  })
})
