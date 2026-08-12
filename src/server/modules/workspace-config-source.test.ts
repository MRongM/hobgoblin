import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  cleanupWorkspaceConfig,
  inspectWorkspaceConfigCleanup,
  readWorkspaceConfig,
  writeWorkspaceConfig,
} from '#/server/modules/workspace-config-source.ts'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'

const temporaryDirectories: string[] = []

async function createFixture(): Promise<{ directory: string; dataFile: string; root: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'hobgoblin-workspace-config-'))
  temporaryDirectories.push(directory)
  const root = path.join(directory, 'workspace')
  await mkdir(root)
  return {
    directory,
    dataFile: path.join(directory, 'app-data', 'workspace-configs.json'),
    root,
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('workspace config source', () => {
  test('reports an unregistered workspace as missing', async () => {
    const { dataFile, root } = await createFixture()

    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
  })

  test('persists ordered membership in the application-data registry without creating goblin.toml', async () => {
    const { dataFile, root } = await createFixture()

    await writeWorkspaceConfig(root, { repo: ['web', 'api'] }, { dataFile, randomId: () => 'safe' })

    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['web', 'api'] },
    })
    const registry = JSON.parse(await readFile(dataFile, 'utf8')) as {
      version: number
      workspaces: Array<{ rootId: string; repo: string[] }>
    }
    expect(registry).toEqual({
      version: 1,
      workspaces: [{ rootId: path.resolve(root), repo: ['web', 'api'] }],
    })
    await expect(readFile(path.join(root, 'goblin.toml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('ignores an existing goblin.toml workspace table', async () => {
    const { dataFile, root } = await createFixture()
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nrepo = ["legacy"]\n')

    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
  })

  test('preserves other roots and replaces one root without changing registry order', async () => {
    const { directory, dataFile, root } = await createFixture()
    const secondRoot = path.join(directory, 'second-workspace')
    await mkdir(secondRoot)

    await writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile })
    await writeWorkspaceConfig(secondRoot, { repo: ['docs'] }, { dataFile })
    await writeWorkspaceConfig(root, { repo: ['web', 'api'] }, { dataFile })

    const registry = JSON.parse(await readFile(dataFile, 'utf8')) as {
      workspaces: Array<{ rootId: string; repo: string[] }>
    }
    expect(registry.workspaces).toEqual([
      { rootId: path.resolve(root), repo: ['web', 'api'] },
      { rootId: path.resolve(secondRoot), repo: ['docs'] },
    ])
  })

  test('serializes concurrent writes so no workspace is lost', async () => {
    const { directory, dataFile, root } = await createFixture()
    const secondRoot = path.join(directory, 'second-workspace')
    const thirdRoot = path.join(directory, 'third-workspace')

    await Promise.all([
      writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile }),
      writeWorkspaceConfig(secondRoot, { repo: ['web'] }, { dataFile }),
      writeWorkspaceConfig(thirdRoot, { repo: ['docs'] }, { dataFile }),
    ])

    const registry = JSON.parse(await readFile(dataFile, 'utf8')) as {
      workspaces: Array<{ rootId: string; repo: string[] }>
    }
    expect(registry.workspaces).toHaveLength(3)
    expect(new Set(registry.workspaces.map((workspace) => workspace.rootId))).toEqual(
      new Set([path.resolve(root), path.resolve(secondRoot), path.resolve(thirdRoot)]),
    )
  })

  test('normalizes local root identifiers before storing and looking them up', async () => {
    const { dataFile, root } = await createFixture()
    const unnormalizedRoot = path.join(root, 'nested', '..')

    await writeWorkspaceConfig(unnormalizedRoot, { repo: ['api'] }, { dataFile })

    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['api'] },
    })
  })

  test('persists an SSH workspace identifier locally without contacting the remote host', async () => {
    const { dataFile } = await createFixture()
    const rootId = normalizeRemoteRepoId({ alias: 'prod', remotePath: '/srv/workspace' })

    await writeWorkspaceConfig(rootId, { repo: ['api', 'web'] }, { dataFile })

    await expect(readWorkspaceConfig(rootId, { dataFile })).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['api', 'web'] },
    })
  })

  test.each([
    ['invalid JSON', '{'],
    ['unsupported version', JSON.stringify({ version: 2, workspaces: [] })],
    [
      'duplicate roots',
      JSON.stringify({
        version: 1,
        workspaces: [
          { rootId: '/workspace', repo: ['api'] },
          { rootId: '/workspace', repo: ['web'] },
        ],
      }),
    ],
    [
      'invalid repositories',
      JSON.stringify({ version: 1, workspaces: [{ rootId: '/workspace', repo: ['nested/web'] }] }),
    ],
  ])('reports %s in the internal registry as a safe read failure', async (_label, contents) => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, contents)

    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({
      kind: 'invalid',
      message: 'workspace.config.read-failed',
    })
  })

  test('does not overwrite a corrupt internal registry', async () => {
    const { dataFile, root } = await createFixture()
    const corrupt = '{"version":1,"workspaces":['
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, corrupt)

    await expect(writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile })).rejects.toThrow(
      'workspace.config.read-failed',
    )
    await expect(readFile(dataFile, 'utf8')).resolves.toBe(corrupt)
  })

  test('preserves a pre-existing temporary file when atomic creation collides', async () => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    const temporaryFile = path.join(path.dirname(dataFile), '.workspace-configs.json.safe.tmp')
    await writeFile(temporaryFile, 'pre-existing')

    await expect(writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile, randomId: () => 'safe' })).rejects.toThrow()

    await expect(readdir(path.dirname(dataFile))).resolves.toContain('.workspace-configs.json.safe.tmp')
    await expect(readFile(temporaryFile, 'utf8')).resolves.toBe('pre-existing')
  })

  test('plans and removes only the selected project configuration from a valid registry', async () => {
    const { directory, dataFile, root } = await createFixture()
    const secondRoot = path.join(directory, 'second-workspace')
    await writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile })
    await writeWorkspaceConfig(secondRoot, { repo: ['docs'] }, { dataFile })

    const plan = await inspectWorkspaceConfigCleanup(root, { dataFile })

    expect(plan).toMatchObject({ rootId: path.resolve(root), scope: 'project' })
    expect(plan.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    await cleanupWorkspaceConfig(plan, { dataFile })
    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
    await expect(readWorkspaceConfig(secondRoot, { dataFile })).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['docs'] },
    })
  })

  test('repairs a structurally recoverable registry while preserving valid other projects', async () => {
    const { directory, dataFile, root } = await createFixture()
    const secondRoot = path.join(directory, 'second-workspace')
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(
      dataFile,
      JSON.stringify({
        version: 1,
        workspaces: [
          { rootId: path.resolve(root), repo: ['nested/api'] },
          { rootId: path.resolve(secondRoot), repo: ['docs'] },
        ],
      }),
    )

    const plan = await inspectWorkspaceConfigCleanup(root, { dataFile })

    expect(plan.scope).toBe('registry-repair')
    await cleanupWorkspaceConfig(plan, { dataFile })
    await expect(readWorkspaceConfig(root, { dataFile })).resolves.toEqual({ kind: 'missing' })
    await expect(readWorkspaceConfig(secondRoot, { dataFile })).resolves.toEqual({
      kind: 'ready',
      config: { repo: ['docs'] },
    })
  })

  test('discloses and performs a registry reset when raw data cannot be recovered', async () => {
    const { dataFile, root } = await createFixture()
    await mkdir(path.dirname(dataFile), { recursive: true })
    await writeFile(dataFile, '{')

    const plan = await inspectWorkspaceConfigCleanup(root, { dataFile })

    expect(plan.scope).toBe('registry-reset')
    await cleanupWorkspaceConfig(plan, { dataFile })
    await expect(JSON.parse(await readFile(dataFile, 'utf8'))).toEqual({ version: 1, workspaces: [] })
  })

  test('rejects a stale cleanup fingerprint before changing the registry', async () => {
    const { dataFile, root } = await createFixture()
    await writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile })
    const plan = await inspectWorkspaceConfigCleanup(root, { dataFile })
    await writeWorkspaceConfig(root, { repo: ['web'] }, { dataFile })
    const changed = await readFile(dataFile, 'utf8')

    await expect(cleanupWorkspaceConfig(plan, { dataFile })).rejects.toThrow('workspace.recovery.plan-stale')
    await expect(readFile(dataFile, 'utf8')).resolves.toBe(changed)
  })

  test('preserves the registry when an atomic recovery write collides', async () => {
    const { dataFile, root } = await createFixture()
    await writeWorkspaceConfig(root, { repo: ['api'] }, { dataFile })
    const plan = await inspectWorkspaceConfigCleanup(root, { dataFile })
    const original = await readFile(dataFile, 'utf8')
    await writeFile(path.join(path.dirname(dataFile), '.workspace-configs.json.safe.tmp'), 'occupied')

    await expect(cleanupWorkspaceConfig(plan, { dataFile, randomId: () => 'safe' })).rejects.toThrow()
    await expect(readFile(dataFile, 'utf8')).resolves.toBe(original)
  })

  test.each([
    ['duplicate repositories', { repo: ['api', 'api'] }, 'workspace.config.duplicate-repository'],
    ['empty repositories', { repo: [] }, 'workspace.config.empty-repositories'],
    ['path separators', { repo: ['api', 'nested/web'] }, 'workspace.config.invalid-repository'],
    ['parent directory', { repo: ['..'] }, 'workspace.config.invalid-repository'],
  ])('rejects %s before persistence', async (_label, config, message) => {
    const { dataFile, root } = await createFixture()

    await expect(writeWorkspaceConfig(root, config, { dataFile })).rejects.toThrow(message)
  })
})
