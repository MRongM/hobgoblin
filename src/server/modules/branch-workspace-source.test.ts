import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  readBranchWorkspaceManifests,
  replaceBranchWorkspaceManifests,
  updateBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import { branchWorkspacePath } from '#/server/modules/workspace-paths.ts'
import type { BranchWorkspaceManifest } from '#/shared/branch-workspaces.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'

const temporaryDirectories: string[] = []

async function createFixture(): Promise<{ directory: string; dataFile: string; root: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'hobgoblin-branch-workspaces-'))
  temporaryDirectories.push(directory)
  const root = path.join(directory, 'workspace')
  await mkdir(root)
  return { directory, dataFile: path.join(directory, 'app-data', 'branch-workspaces.json'), root }
}

function manifest(rootId: string, branch: string, repositoryName = 'api'): BranchWorkspaceManifest {
  const slug = branch.replaceAll('/', '-').replaceAll('.', '-')
  const directoryName = `goblin-${slug}`
  const workspacePath = branchWorkspacePath(rootId, directoryName)
  const pathApi = rootId.startsWith('ssh-config://') ? path.posix : path
  return {
    id: `branch-workspace:${branch}`,
    rootId,
    branch,
    directoryName,
    path: workspacePath,
    repositories: [
      {
        repositoryName,
        targetBranch: branch,
        baseBranch: 'main',
        branchOrigin: 'created',
        worktreePath: pathApi.join(workspacePath, repositoryName),
        progress: 'complete',
      },
    ],
    auxiliaryEntries: [],
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('branch workspace source', () => {
  test('reports an unregistered workspace as missing', async () => {
    const { dataFile, root } = await createFixture()

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
  })

  test('round-trips ordered manifests through the application-data registry', async () => {
    const { dataFile, root } = await createFixture()
    const manifests = [manifest(root, 'feature/auth'), manifest(root, 'fix/session', 'web')]
    manifests[0]!.repositories[0] = {
      ...manifests[0]!.repositories[0]!,
      progress: 'removed',
      branchCleanupProgress: 'complete',
      upstreamCleanupProgress: 'failed',
    }

    await replaceBranchWorkspaceManifests(root, manifests, { dataFile, randomId: () => 'safe' })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests,
    })
    await expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({
      version: 1,
      workspaces: [{ rootId: path.resolve(root), branchWorkspaces: manifests }],
    })
  })

  test('releases completed auxiliary entries while retaining incomplete materialization intent', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/dependencies')
    item.auxiliaryEntries = [
      auxiliaryEntry(item, 'README.md', 'complete'),
      auxiliaryEntry(item, 'notes.md', 'failed'),
    ]
    item.operation = { kind: 'create', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' }

    await replaceBranchWorkspaceManifests(root, [item], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [{ auxiliaryEntries: [{ name: 'notes.md', progress: 'failed' }] }],
    })
    expect(JSON.parse(await readFile(dataFile, 'utf8'))).toMatchObject({
      workspaces: [{ branchWorkspaces: [{ auxiliaryEntries: [{ name: 'notes.md', progress: 'failed' }] }] }],
    })
  })

  test('round-trips repository bootstrap intent and progress', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/dependencies')
    item.repositories[0] = {
      ...item.repositories[0]!,
      worktreeBootstrap: {
        kind: 'materialize',
        candidateScope: 'ignored-only',
        selections: [{ path: 'node_modules', mode: 'symlink' }],
      },
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    }

    await replaceBranchWorkspaceManifests(root, [item], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [item],
    })
  })

  test('round-trips interrupted member reduction intent', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/reduce')
    item.repositories[0] = { ...item.repositories[0]!, progress: 'removed' }
    item.operation = { kind: 'reduce', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' }

    await replaceBranchWorkspaceManifests(root, [item], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [item],
    })
  })

  test('normalizes local and SSH root identifiers before lookup', async () => {
    const { dataFile, root } = await createFixture()
    const unnormalizedRoot = path.join(root, 'nested', '..')
    const remoteRoot = normalizeRemoteRepoId({ alias: 'dev', remotePath: '/srv/workspace' })

    await replaceBranchWorkspaceManifests(unnormalizedRoot, [manifest(path.resolve(root), 'feature/local')], {
      dataFile,
    })
    await replaceBranchWorkspaceManifests(remoteRoot, [manifest(remoteRoot, 'feature/remote')], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [{ branch: 'feature/local' }],
    })
    await expect(readBranchWorkspaceManifests(remoteRoot, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [{ branch: 'feature/remote' }],
    })
  })

  test('serializes concurrent manifest updates without losing either item', async () => {
    const { dataFile, root } = await createFixture()

    await Promise.all([
      updateBranchWorkspaceManifests(root, (items) => [...items, manifest(root, 'feature/a')], { dataFile }),
      updateBranchWorkspaceManifests(root, (items) => [...items, manifest(root, 'feature/b')], { dataFile }),
    ])

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [{ branch: 'feature/a' }, { branch: 'feature/b' }],
    })
  })

  test.each([
    [
      'duplicate branches',
      (root: string) => [manifest(root, 'feature/a'), { ...manifest(root, 'feature/a'), id: 'different' }],
    ],
    [
      'duplicate identifiers',
      (root: string) => [
        manifest(root, 'feature/a'),
        { ...manifest(root, 'feature/b'), id: 'branch-workspace:feature/a' },
      ],
    ],
    ['path mismatch', (root: string) => [{ ...manifest(root, 'feature/a'), path: path.join(root, 'somewhere-else') }]],
    [
      'target branch mismatch',
      (root: string) => [
        {
          ...manifest(root, 'feature/a'),
          repositories: [{ ...manifest(root, 'feature/a').repositories[0]!, targetBranch: 'feature/b' }],
        },
      ],
    ],
  ])('rejects %s before persistence', async (_label, build) => {
    const { dataFile, root } = await createFixture()

    await expect(replaceBranchWorkspaceManifests(root, build(root), { dataFile })).rejects.toThrow(
      'workspace.branch-workspace.invalid-registry',
    )
    await expect(readFile(dataFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test.each([
    ['invalid JSON', '{'],
    ['unsupported version', JSON.stringify({ version: 2, workspaces: [] })],
    [
      'duplicate workspace roots',
      JSON.stringify({
        version: 1,
        workspaces: [
          { rootId: '/workspace', branchWorkspaces: [] },
          { rootId: '/workspace', branchWorkspaces: [] },
        ],
      }),
    ],
  ])('reports %s as invalid and preserves it', async (_label, contents) => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, contents)

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'invalid',
      message: 'workspace.branch-workspace.read-failed',
    })
    await expect(replaceBranchWorkspaceManifests(root, [], { dataFile })).rejects.toThrow(
      'workspace.branch-workspace.read-failed',
    )
    await expect(readFile(dataFile, 'utf8')).resolves.toBe(contents)
  })

  test('preserves a pre-existing temporary file when atomic creation collides', async () => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    const temporaryFile = path.join(path.dirname(dataFile), '.branch-workspaces.json.safe.tmp')
    await writeFile(temporaryFile, 'pre-existing')

    await expect(
      replaceBranchWorkspaceManifests(root, [manifest(root, 'feature/a')], {
        dataFile,
        randomId: () => 'safe',
      }),
    ).rejects.toThrow()

    await expect(readdir(path.dirname(dataFile))).resolves.toContain('.branch-workspaces.json.safe.tmp')
    await expect(readFile(temporaryFile, 'utf8')).resolves.toBe('pre-existing')
  })
})

function auxiliaryEntry(
  item: BranchWorkspaceManifest,
  name: string,
  progress: 'complete' | 'failed',
): BranchWorkspaceManifest['auxiliaryEntries'][number] {
  return {
    name,
    mode: 'copy',
    sourcePath: path.join(item.rootId, name),
    targetPath: path.join(item.path, name),
    progress,
  }
}
