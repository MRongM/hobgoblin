import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  copyBranchWorkspaceEntry,
  createBranchWorkspaceDirectory,
  fingerprintBranchWorkspaceEntry,
  inspectBranchWorkspacePath,
  listBranchWorkspaceAuxiliaryCandidates,
  listBranchWorkspaceChildren,
  materializeBranchWorkspaceSymlink,
  removeBranchWorkspaceEntry,
} from '#/server/modules/branch-workspace-materialization-source.ts'
import { normalizeRemoteRepoId, normalizeRemoteTarget } from '#/shared/remote-repo.ts'

const temporaryDirectories: string[] = []

async function createFixture(): Promise<{ directory: string; root: string; branchRoot: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'hobgoblin-branch-materialization-'))
  temporaryDirectories.push(directory)
  const root = path.join(directory, 'workspace')
  const branchRoot = path.join(root, 'goblin-feature-auth')
  await mkdir(root)
  return { directory, root, branchRoot }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('branch workspace local materialization source', () => {
  test('lists only selectable direct children with symlink resolution metadata', async () => {
    const { directory, root } = await createFixture()
    const outside = path.join(directory, 'outside')
    await mkdir(path.join(root, 'api'))
    await mkdir(path.join(root, 'docs'))
    await mkdir(path.join(root, 'goblin-existing'))
    await mkdir(path.join(root, '.goblin-staging'))
    await mkdir(outside)
    await writeFile(path.join(root, 'README.md'), 'readme')
    await symlink(outside, path.join(root, 'shared'))

    const resolvedRoot = await realpath(root)
    const resolvedOutside = await realpath(outside)

    await expect(listBranchWorkspaceAuxiliaryCandidates(root, new Set(['api']))).resolves.toEqual([
      {
        name: 'README.md',
        path: path.join(root, 'README.md'),
        kind: 'file',
        resolvedPath: path.join(resolvedRoot, 'README.md'),
        outsideRoot: false,
      },
      {
        name: 'docs',
        path: path.join(root, 'docs'),
        kind: 'directory',
        resolvedPath: path.join(resolvedRoot, 'docs'),
        outsideRoot: false,
      },
      {
        name: 'shared',
        path: path.join(root, 'shared'),
        kind: 'symlink',
        resolvedPath: resolvedOutside,
        outsideRoot: true,
      },
    ])
  })

  test('excludes worktrees belonging to configured repositories from auxiliary candidates', async () => {
    const { root } = await createFixture()
    const repository = path.join(root, 'api')
    const linkedWorktree = path.join(root, 'api-feature')
    await mkdir(path.join(root, 'docs'))
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

    await expect(listBranchWorkspaceAuxiliaryCandidates(root, new Set(['api']))).resolves.toEqual([
      {
        name: 'docs',
        path: path.join(root, 'docs'),
        kind: 'directory',
        resolvedPath: await realpath(path.join(root, 'docs')),
        outsideRoot: false,
      },
    ])
  })

  test('inspects paths without hiding their no-follow kind or direct-child relation', async () => {
    const { directory, root } = await createFixture()
    const outside = path.join(directory, 'outside.txt')
    await writeFile(outside, 'outside')
    await symlink(outside, path.join(root, 'shared.txt'))
    await mkdir(path.join(root, 'docs'))
    await writeFile(path.join(root, 'docs', 'guide.md'), 'guide')

    await expect(inspectBranchWorkspacePath(root, path.join(root, 'shared.txt'))).resolves.toEqual({
      path: path.join(root, 'shared.txt'),
      exists: true,
      kind: 'symlink',
      resolvedPath: await realpath(outside),
      linkTarget: outside,
      directChild: true,
      outsideRoot: true,
    })
    await expect(inspectBranchWorkspacePath(root, path.join(root, 'docs', 'guide.md'))).resolves.toMatchObject({
      exists: true,
      kind: 'file',
      directChild: false,
      outsideRoot: false,
    })
    await expect(inspectBranchWorkspacePath(root, path.join(root, 'missing'))).resolves.toEqual({
      path: path.join(root, 'missing'),
      exists: false,
      kind: 'missing',
      directChild: true,
      outsideRoot: false,
    })
  })

  test('copies a root symlink target while preserving nested symlinks', async () => {
    const { directory, root, branchRoot } = await createFixture()
    const sourceDirectory = path.join(directory, 'source')
    await mkdir(sourceDirectory)
    await writeFile(path.join(sourceDirectory, 'value.txt'), 'value')
    await symlink('value.txt', path.join(sourceDirectory, 'nested-link'))
    await symlink(sourceDirectory, path.join(root, 'shared'))
    await mkdir(branchRoot)

    await copyBranchWorkspaceEntry(root, path.join(root, 'shared'), path.join(branchRoot, 'shared'))

    await expect(readFile(path.join(branchRoot, 'shared', 'value.txt'), 'utf8')).resolves.toBe('value')
    expect((await lstat(path.join(branchRoot, 'shared', 'nested-link'))).isSymbolicLink()).toBe(true)
    await expect(readlink(path.join(branchRoot, 'shared', 'nested-link'))).resolves.toBe('value.txt')
  })

  test('produces a stable no-follow fingerprint and detects content changes', async () => {
    const { root, branchRoot } = await createFixture()
    const target = path.join(branchRoot, 'docs')
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, 'guide.md'), 'one')
    await symlink('guide.md', path.join(target, 'guide-link'))

    const first = await fingerprintBranchWorkspaceEntry(root, target)
    const second = await fingerprintBranchWorkspaceEntry(root, target)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)

    await writeFile(path.join(target, 'guide.md'), 'two')
    await expect(fingerprintBranchWorkspaceEntry(root, target)).resolves.not.toBe(first)
  })

  test('creates, lists, links, and removes entries without following managed links', async () => {
    const { root, branchRoot } = await createFixture()
    const source = path.join(root, 'README.md')
    const target = path.join(branchRoot, 'README.md')
    await writeFile(source, 'keep')

    await createBranchWorkspaceDirectory(root, branchRoot)
    await materializeBranchWorkspaceSymlink(root, source, target)

    await expect(readlink(target)).resolves.toBe(source)
    await expect(listBranchWorkspaceChildren(root, branchRoot)).resolves.toEqual(['README.md'])
    await removeBranchWorkspaceEntry(root, target)
    await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(source, 'utf8')).resolves.toBe('keep')
    await removeBranchWorkspaceEntry(root, branchRoot)
    await expect(lstat(branchRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('rejects mutations outside the workspace and sources below a root child', async () => {
    const { directory, root, branchRoot } = await createFixture()
    await mkdir(path.join(root, 'docs'))
    await mkdir(branchRoot)

    await expect(createBranchWorkspaceDirectory(root, path.join(directory, 'escape'))).rejects.toThrow(
      'workspace.branch-workspace.invalid-path',
    )
    await expect(
      copyBranchWorkspaceEntry(root, path.join(root, 'docs', 'nested'), path.join(branchRoot, 'nested')),
    ).rejects.toThrow('workspace.branch-workspace.invalid-source')
    await expect(removeBranchWorkspaceEntry(root, root)).rejects.toThrow('workspace.branch-workspace.invalid-path')
  })

  test('dispatches SSH roots through fixed remote wrappers without local fallback', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/srv/workspace' })
    const target = normalizeRemoteTarget({
      alias: 'dev',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace',
    })!
    const dependencies = {
      resolveRemoteTarget: vi.fn(async () => ({ target })),
      listRemoteCandidates: vi.fn(async () => [
        {
          name: 'docs',
          path: '/srv/workspace/docs',
          kind: 'directory' as const,
          resolvedPath: '/srv/workspace/docs',
          outsideRoot: false,
        },
      ]),
      inspectRemotePath: vi.fn(async () => ({
        path: '/srv/workspace/docs',
        exists: true,
        kind: 'directory' as const,
        resolvedPath: '/srv/workspace/docs',
        directChild: true,
        outsideRoot: false,
      })),
      createRemoteDirectory: vi.fn(async () => undefined),
      materializeRemoteSymlink: vi.fn(async () => undefined),
      copyRemoteEntry: vi.fn(async () => undefined),
      fingerprintRemoteEntry: vi.fn(async () => 'a'.repeat(64)),
      removeRemoteEntry: vi.fn(async () => undefined),
      listRemoteChildren: vi.fn(async () => ['api']),
    }

    await expect(
      listBranchWorkspaceAuxiliaryCandidates(rootId, new Set(['api']), undefined, dependencies),
    ).resolves.toMatchObject([{ name: 'docs' }])
    await expect(
      inspectBranchWorkspacePath(rootId, '/srv/workspace/docs', undefined, dependencies),
    ).resolves.toMatchObject({ kind: 'directory' })
    await createBranchWorkspaceDirectory(rootId, '/srv/workspace/goblin-feature', undefined, dependencies)
    await materializeBranchWorkspaceSymlink(
      rootId,
      '/srv/workspace/README.md',
      '/srv/workspace/goblin-feature/README.md',
      undefined,
      dependencies,
    )
    await copyBranchWorkspaceEntry(
      rootId,
      '/srv/workspace/docs',
      '/srv/workspace/goblin-feature/docs',
      undefined,
      dependencies,
    )
    await expect(
      fingerprintBranchWorkspaceEntry(rootId, '/srv/workspace/goblin-feature/docs', undefined, dependencies),
    ).resolves.toBe('a'.repeat(64))
    await expect(
      listBranchWorkspaceChildren(rootId, '/srv/workspace/goblin-feature', undefined, dependencies),
    ).resolves.toEqual(['api'])
    await removeBranchWorkspaceEntry(rootId, '/srv/workspace/goblin-feature/docs', undefined, dependencies)

    expect(dependencies.resolveRemoteTarget).toHaveBeenCalledTimes(8)
    expect(dependencies.createRemoteDirectory).toHaveBeenCalledWith(
      target,
      '/srv/workspace',
      '/srv/workspace/goblin-feature',
      { signal: undefined },
    )

    dependencies.copyRemoteEntry.mockRejectedValueOnce(new Error('workspace.branch-workspace.remote-operation-failed'))
    await expect(
      copyBranchWorkspaceEntry(
        rootId,
        '/srv/workspace/docs',
        '/srv/workspace/goblin-feature/docs',
        undefined,
        dependencies,
      ),
    ).rejects.toThrow('workspace.branch-workspace.remote-operation-failed')
  })
})
