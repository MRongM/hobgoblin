import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  cleanupBranchWorkspaceRegistry,
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

function manifest(
  rootId: string,
  branch: string,
  repositoryName = 'api',
  directoryPrefix = 'goblin-',
): BranchWorkspaceManifest {
  const slug = branch.replaceAll('/', '-').replaceAll('.', '-')
  const directoryName = `${directoryPrefix}${slug}`
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
        creationBase: { kind: 'localBranch', branch: 'main' },
        syncBeforeCreate: true,
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

  test('round-trips manifests using the current directory prefix', async () => {
    const { dataFile, root } = await createFixture()
    const current = manifest(root, 'feature/auth', 'api', 'hobgoblin-')

    await replaceBranchWorkspaceManifests(root, [current], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [current],
    })
  })

  test('migrates legacy repository base branches without enabling synchronization', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/legacy-base')
    const canonicalMember = item.repositories[0]!
    const legacyMember = {
      repositoryName: canonicalMember.repositoryName,
      targetBranch: canonicalMember.targetBranch,
      baseBranch: 'main',
      branchOrigin: canonicalMember.branchOrigin,
      worktreePath: canonicalMember.worktreePath,
      progress: canonicalMember.progress,
    }
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(
      dataFile,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            rootId: path.resolve(root),
            branchWorkspaces: [{ ...item, repositories: [legacyMember] }],
          },
        ],
      }),
    )

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [
        {
          ...item,
          repositories: [
            {
              ...canonicalMember,
              syncBeforeCreate: false,
            },
          ],
        },
      ],
    })
  })

  test('releases one-time auxiliary intent once every repository member is complete', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/dependencies')
    item.auxiliaryEntries = [auxiliaryEntry(item, 'README.md', 'complete'), auxiliaryEntry(item, 'notes.md', 'failed')]
    item.operation = { kind: 'create' }

    await replaceBranchWorkspaceManifests(root, [item], { dataFile })

    const snapshot = await readBranchWorkspaceManifests(root, { dataFile })
    expect(snapshot).toMatchObject({
      kind: 'ready',
      manifests: [{ auxiliaryEntries: [] }],
    })
    if (snapshot.kind === 'ready') expect(snapshot.manifests[0]).not.toHaveProperty('operation')
    expect(JSON.parse(await readFile(dataFile, 'utf8'))).toMatchObject({
      workspaces: [{ branchWorkspaces: [{ auxiliaryEntries: [] }] }],
    })
  })

  test('discards legacy repository bootstrap recovery fields while reading manifests', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/dependencies')
    const legacyMember = {
      ...item.repositories[0]!,
      worktreeBootstrap: {
        kind: 'materialize',
        sourceWorktreePath: path.join(root, 'api-main'),
        selections: [{ path: '.env.local', mode: 'copy' }],
      },
      bootstrapProgress: 'failed',
      bootstrapLastError: 'link failed',
    }
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(
      dataFile,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            rootId: path.resolve(root),
            branchWorkspaces: [{ ...item, repositories: [legacyMember] }],
          },
        ],
      }),
    )

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [item],
    })
  })

  test('round-trips interrupted member reduction intent', async () => {
    const { dataFile, root } = await createFixture()
    const item = manifest(root, 'feature/reduce')
    item.repositories[0] = { ...item.repositories[0]!, progress: 'removed' }
    item.operation = { kind: 'reduce' }

    await replaceBranchWorkspaceManifests(root, [item], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [item],
    })
  })

  test('releases completed create intent and normalizes legacy operation metadata', async () => {
    const { dataFile, root } = await createFixture()
    const compact = manifest(root, 'feature/compact')
    compact.operation = { kind: 'create' }

    await replaceBranchWorkspaceManifests(root, [compact], { dataFile })
    const settled = { ...compact }
    delete settled.operation
    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [settled],
    })

    const legacy = manifest(root, 'feature/legacy')
    await writeFile(
      dataFile,
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            rootId: root,
            branchWorkspaces: [
              {
                ...legacy,
                operation: { kind: 'repair', phase: 'failed', startedAt: '2026-07-22T00:00:00.000Z' },
              },
            ],
          },
        ],
      }),
    )

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [{ ...legacy, operation: { kind: 'repair' } }],
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

  test('leaves a valid or missing registry unchanged during cleanup', async () => {
    const missing = await createFixture()
    const ready = await createFixture()
    await replaceBranchWorkspaceManifests(ready.root, [manifest(ready.root, 'feature/a')], {
      dataFile: ready.dataFile,
    })
    const original = await readFile(ready.dataFile, 'utf8')

    await expect(cleanupBranchWorkspaceRegistry({ dataFile: missing.dataFile })).resolves.toEqual({
      ok: true,
      outcome: 'unchanged',
      removedRecords: 0,
    })
    await expect(cleanupBranchWorkspaceRegistry({ dataFile: ready.dataFile })).resolves.toEqual({
      ok: true,
      outcome: 'unchanged',
      removedRecords: 0,
    })
    await expect(readFile(missing.dataFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(ready.dataFile, 'utf8')).resolves.toBe(original)
  })

  test('removes only invalid and duplicate records from a parseable registry', async () => {
    const { dataFile, root } = await createFixture()
    const valid = manifest(root, 'feature/a')
    const invalid = { ...manifest(root, 'feature/b'), path: path.join(root, 'wrong') }
    const duplicate = { ...manifest(root, 'feature/c'), id: valid.id }
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(
      dataFile,
      JSON.stringify({
        version: 1,
        workspaces: [
          { rootId: root, branchWorkspaces: [valid, invalid, duplicate] },
          { rootId: 42, branchWorkspaces: [] },
        ],
      }),
    )

    await expect(cleanupBranchWorkspaceRegistry({ dataFile })).resolves.toEqual({
      ok: true,
      outcome: 'repaired',
      removedRecords: 3,
    })
    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      manifests: [valid],
    })
  })

  test('resets only registry records when the registry cannot be parsed', async () => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, '{')

    await expect(cleanupBranchWorkspaceRegistry({ dataFile })).resolves.toEqual({
      ok: true,
      outcome: 'reset',
      removedRecords: 0,
    })
    await expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({ version: 1, workspaces: [] })
    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
  })

  test('propagates an atomic cleanup write failure and preserves the invalid registry', async () => {
    const { dataFile } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, '{')
    await writeFile(path.join(path.dirname(dataFile), '.branch-workspaces.json.safe.tmp'), 'occupied')

    await expect(cleanupBranchWorkspaceRegistry({ dataFile, randomId: () => 'safe' })).rejects.toThrow()
    await expect(readFile(dataFile, 'utf8')).resolves.toBe('{')
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
