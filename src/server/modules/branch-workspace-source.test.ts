import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  cleanupBranchWorkspaceRegistry,
  discardBranchWorkspaceRecords,
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
  directoryPrefix = 'hob-',
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

function savedLocation({ id, path }: BranchWorkspaceManifest) {
  return { id, path }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('branch workspace source', () => {
  test('reports an unregistered workspace as missing', async () => {
    const { dataFile, root } = await createFixture()

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
  })

  test('persists only the ordered folder locations in the application-data registry', async () => {
    const { dataFile, root } = await createFixture()
    const manifests = [manifest(root, 'feature/auth'), manifest(root, 'fix/session', 'web')]
    await replaceBranchWorkspaceManifests(root, manifests, { dataFile, randomId: () => 'safe' })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: manifests.map(savedLocation),
    })
    await expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({
      version: 3,
      workspaces: [{ rootId: path.resolve(root), branchWorkspaces: manifests.map(savedLocation) }],
    })
  })

  test('round-trips manifests using the current directory prefix', async () => {
    const { dataFile, root } = await createFixture()
    const current = manifest(root, 'feature/auth')

    await replaceBranchWorkspaceManifests(root, [current], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(current)],
    })
  })

  test('round-trips existing manifests using the legacy hobgoblin directory prefix', async () => {
    const { dataFile, root } = await createFixture()
    const legacy = manifest(root, 'feature/auth', 'api', 'hobgoblin-')

    await replaceBranchWorkspaceManifests(root, [legacy], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(legacy)],
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
      manifests: [{ id: 'branch-workspace:feature/local' }],
    })
    await expect(readBranchWorkspaceManifests(remoteRoot, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [{ id: 'branch-workspace:feature/remote' }],
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
      manifests: [{ id: 'branch-workspace:feature/a' }, { id: 'branch-workspace:feature/b' }],
    })
  })

  test('discards selected application records while preserving other records and roots', async () => {
    const { directory, dataFile, root } = await createFixture()
    const secondRoot = path.join(directory, 'second-workspace')
    const retained = manifest(root, 'feature/retained')
    const discarded = manifest(root, 'feature/discarded')
    const otherRoot = manifest(secondRoot, 'feature/other')
    await replaceBranchWorkspaceManifests(root, [retained, discarded], { dataFile })
    await replaceBranchWorkspaceManifests(secondRoot, [otherRoot], { dataFile })

    await discardBranchWorkspaceRecords(root, [discarded.id], { dataFile })

    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(retained)],
    })
    await expect(readBranchWorkspaceManifests(secondRoot, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(otherRoot)],
    })
  })

  test.each([
    [
      'duplicate directories',
      (root: string) => [manifest(root, 'feature/a'), { ...manifest(root, 'feature/a'), id: 'different' }],
    ],
    [
      'duplicate identifiers',
      (root: string) => [
        manifest(root, 'feature/a'),
        { ...manifest(root, 'feature/b'), id: 'branch-workspace:feature/a' },
      ],
    ],
  ])('rejects %s before persistence', async (_label, build) => {
    const { dataFile, root } = await createFixture()

    await expect(replaceBranchWorkspaceManifests(root, build(root), { dataFile })).rejects.toThrow(
      'workspace.branch-workspace.read-failed',
    )
    await expect(readFile(dataFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test.each([
    ['invalid JSON', '{'],
    ['unsupported version', JSON.stringify({ version: 999, workspaces: [] })],
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
    const invalid = { ...manifest(root, 'feature/b'), path: 'relative-folder' }
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
    await expect(readBranchWorkspaceManifests(root, { dataFile })).resolves.toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(valid)],
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
    await expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({ version: 3, workspaces: [] })
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

describe('folder registry compatibility', () => {
  test('reads v1 without writes and backs it up on first v3 write', async () => {
    const { dataFile, root } = await createFixture()
    const legacy = manifest(root, 'feature/a')
    const raw = JSON.stringify({ version: 1, workspaces: [{ rootId: root, branchWorkspaces: [legacy] }] })
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, raw)
    expect(await readBranchWorkspaceManifests(root, { dataFile })).toMatchObject({
      kind: 'ready',
      manifests: [savedLocation(legacy)],
    })
    expect(await readFile(dataFile, 'utf8')).toBe(raw)
    await expect(readFile(`${dataFile}.v1.bak`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await updateBranchWorkspaceManifests(root, (items) => items, { dataFile })
    expect(JSON.parse(await readFile(dataFile, 'utf8')).version).toBe(3)
    expect(await readFile(`${dataFile}.v1.bak`, 'utf8')).toBe(raw)
  })
})
