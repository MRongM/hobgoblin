import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { discoverWorkspaceRepositories, restoreWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import type { ProbeResult } from '#/shared/rpc.ts'
import { normalizeRemoteRepoId, normalizeRemoteRepoRef, normalizeRemoteTarget } from '#/shared/remote-repo.ts'
import type { RemoteCommandKind, RemoteCommandResult } from '#/system/ssh/commands.ts'

const temporaryRoots: string[] = []

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hobgoblin-workspace-discovery-'))
  temporaryRoots.push(root)
  return root
}

async function createGitDirectory(root: string, name: string, marker: 'directory' | 'file' = 'directory') {
  const repositoryPath = path.join(root, name)
  await mkdir(repositoryPath, { recursive: true })
  if (marker === 'directory') {
    await mkdir(path.join(repositoryPath, '.git'))
  } else {
    await writeFile(path.join(repositoryPath, '.git'), 'gitdir: ../metadata\n')
  }
  return repositoryPath
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('discoverWorkspaceRepositories', () => {
  test('discovers remote workspace repositories in natural order with remote references', async () => {
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace',
    })!
    const rootId = normalizeRemoteRepoId(target)
    const api = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/api' })!
    const linked = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/linked' })!
    const web2 = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/web2' })!
    const web10 = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/web10' })!
    const runRemote = vi.fn(async (_target, command: RemoteCommandKind): Promise<RemoteCommandResult> => {
      if (command.type === 'listWorkspaceGitDirectories') {
        return remoteOk('/srv/workspace/web10\0/srv/workspace/linked\0/srv/workspace/api\0/srv/workspace/web2\0')
      }
      if (command.type === 'testWorkspaceGitDirectory') return remoteOk()
      throw new Error(`unexpected command: ${command.type}`)
    })

    await expect(
      discoverWorkspaceRepositories(rootId, {
        probeRepository: async () => ({ ok: true, root: rootId, name: 'prod:workspace', isGitRepo: false }),
        resolveRemoteTarget: async () => ({ target }),
        runRemote,
        readConfig: async () => ({ kind: 'missing' }),
      }),
    ).resolves.toEqual({
      ok: true,
      rootId,
      repositories: [
        { id: api.id, name: 'api', remoteRef: api },
        { id: linked.id, name: 'linked', remoteRef: linked },
        { id: web2.id, name: 'web2', remoteRef: web2 },
        { id: web10.id, name: 'web10', remoteRef: web10 },
      ],
      candidates: [
        { id: api.id, name: 'api', remoteRef: api, selected: false, available: true },
        { id: linked.id, name: 'linked', remoteRef: linked, selected: false, available: true },
        { id: web2.id, name: 'web2', remoteRef: web2, selected: false, available: true },
        { id: web10.id, name: 'web10', remoteRef: web10, selected: false, available: true },
      ],
      configuration: { kind: 'missing' },
      skipped: [],
    })
  })

  test('uses remote configuration order and retains failed or missing member details', async () => {
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace',
    })!
    const rootId = normalizeRemoteRepoId(target)
    const refs = Object.fromEntries(
      ['api', 'web', 'missing'].map((name) => [
        name,
        normalizeRemoteRepoRef({ alias: 'prod', remotePath: `/srv/workspace/${name}` })!,
      ]),
    )
    const runRemote = vi.fn(async (_target, command: RemoteCommandKind): Promise<RemoteCommandResult> => {
      if (command.type === 'listWorkspaceGitDirectories') {
        return remoteOk('/srv/workspace/wrapper\0/srv/workspace/web\0/srv/workspace/broken\0/srv/workspace/api\0')
      }
      if (command.type !== 'testWorkspaceGitDirectory') throw new Error(`unexpected command: ${command.type}`)
      if (command.path.endsWith('/broken')) return remoteFail('permission denied')
      if (command.path.endsWith('/wrapper')) return remoteFail('not a repository top level')
      return remoteOk()
    })

    const result = await discoverWorkspaceRepositories(rootId, {
      probeRepository: async () => ({ ok: true, root: rootId, name: 'prod:workspace', isGitRepo: false }),
      resolveRemoteTarget: async () => ({ target }),
      runRemote,
      readConfig: async () => ({ kind: 'ready', config: { repo: ['web', 'missing', 'api'] } }),
    })

    expect(result).toEqual({
      ok: true,
      rootId,
      repositories: [
        { id: refs.web!.id, name: 'web', remoteRef: refs.web },
        { id: refs.api!.id, name: 'api', remoteRef: refs.api },
      ],
      candidates: [
        { id: refs.api!.id, name: 'api', remoteRef: refs.api, selected: true, available: true },
        { id: refs.web!.id, name: 'web', remoteRef: refs.web, selected: true, available: true },
        { id: refs.missing!.id, name: 'missing', remoteRef: refs.missing, selected: true, available: false },
      ],
      configuration: { kind: 'ready', config: { repo: ['web', 'missing', 'api'] } },
      skipped: [
        { path: '/srv/workspace/broken', message: 'error.failed-read-repo' },
        { path: '/srv/workspace/wrapper', message: 'error.failed-read-repo' },
      ],
    })
  })

  test('preserves the SSH config changed error when a remote workspace target no longer resolves', async () => {
    const rootId = normalizeRemoteRepoId({ alias: 'removed', remotePath: '/srv/workspace' })

    await expect(
      discoverWorkspaceRepositories(rootId, {
        probeRepository: async () => ({ ok: true, root: rootId, name: 'removed:workspace', isGitRepo: false }),
        resolveRemoteTarget: async () => {
          throw new Error('error.ssh-config-changed')
        },
      }),
    ).resolves.toEqual({ ok: false, message: 'error.ssh-config-changed' })
  })

  test('discovers only immediate real directories with git markers in natural name order', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const web2 = await createGitDirectory(root, 'web2', 'file')
    const web10 = await createGitDirectory(root, 'web10')
    const nested = path.join(root, 'nested')
    await createGitDirectory(nested, 'child')

    const probeRepository = vi.fn(async (cwd: string): Promise<ProbeResult> => {
      if (cwd === root) return { ok: true, root, name: path.basename(root), isGitRepo: false }
      return { ok: true, root: cwd, name: path.basename(cwd), isGitRepo: true }
    })

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [
        { id: api, name: 'api' },
        { id: web2, name: 'web2' },
        { id: web10, name: 'web10' },
      ],
      candidates: [
        { id: api, name: 'api', selected: false, available: true },
        { id: web2, name: 'web2', selected: false, available: true },
        { id: web10, name: 'web10', selected: false, available: true },
      ],
      configuration: { kind: 'missing' },
      skipped: [],
    })
    expect(probeRepository).not.toHaveBeenCalledWith(path.join(nested, 'child'))
  })

  test('discovers an immediate repository directory symlink under its logical member name', async () => {
    const root = await createTemporaryRoot()
    const targetRoot = await createTemporaryRoot()
    const target = await createGitDirectory(targetRoot, 'physical-repository')
    const linked = path.join(root, 'linked')
    await symlink(target, linked)

    const probeRepository = vi.fn(async (cwd: string): Promise<ProbeResult> => {
      if (cwd === root) return { ok: true, root, name: path.basename(root), isGitRepo: false }
      if (cwd === linked) return { ok: true, root: target, name: path.basename(target), isGitRepo: true }
      throw new Error(`unexpected probe: ${cwd}`)
    })

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: linked, name: 'linked' }],
      candidates: [{ id: linked, name: 'linked', selected: false, available: true }],
      configuration: { kind: 'missing' },
      skipped: [],
    })
  })

  test('keeps successful repositories when another candidate fails to probe', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const broken = await createGitDirectory(root, 'broken')
    const wrapper = await createGitDirectory(root, 'wrapper')

    const probeRepository = vi.fn(async (cwd: string): Promise<ProbeResult> => {
      if (cwd === root) return { ok: true, root, name: path.basename(root), isGitRepo: false }
      if (cwd === broken) return { ok: false, message: 'error.path-permission-denied' }
      if (cwd === wrapper) return { ok: true, root: api, name: 'api', isGitRepo: true }
      return { ok: true, root: cwd, name: path.basename(cwd), isGitRepo: true }
    })

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: api, name: 'api' }],
      candidates: [{ id: api, name: 'api', selected: false, available: true }],
      configuration: { kind: 'missing' },
      skipped: [
        { path: broken, message: 'error.path-permission-denied' },
        { path: wrapper, message: 'error.failed-read-repo' },
      ],
    })
  })

  test('keeps successful repositories when another candidate probe throws', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const broken = await createGitDirectory(root, 'broken')

    const probeRepository = vi.fn(async (cwd: string): Promise<ProbeResult> => {
      if (cwd === root) return { ok: true, root, name: path.basename(root), isGitRepo: false }
      if (cwd === broken) throw new Error('permission denied')
      return { ok: true, root: cwd, name: path.basename(cwd), isGitRepo: true }
    })

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: api, name: 'api' }],
      candidates: [{ id: api, name: 'api', selected: false, available: true }],
      configuration: { kind: 'missing' },
      skipped: [{ path: broken, message: 'error.failed-read-repo' }],
    })
  })

  test('returns the root probe error without reading child candidates', async () => {
    const root = path.join(tmpdir(), 'missing-hobgoblin-workspace')
    const probeRepository = vi.fn(
      async (): Promise<ProbeResult> => ({
        ok: false,
        message: 'error.path-not-found',
      }),
    )

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
      ok: false,
      message: 'error.path-not-found',
    })
    expect(probeRepository).toHaveBeenCalledTimes(1)
  })

  test('uses configured repositories as authoritative membership', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const web = await createGitDirectory(root, 'web')
    const docs = await createGitDirectory(root, 'docs')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    await expect(
      discoverWorkspaceRepositories(root, {
        probeRepository,
        readConfig: async () => ({ kind: 'ready', config: { repo: ['api', 'web'] } }),
      }),
    ).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [
        { id: api, name: 'api' },
        { id: web, name: 'web' },
      ],
      candidates: [
        { id: api, name: 'api', selected: true, available: true },
        { id: docs, name: 'docs', selected: false, available: true },
        { id: web, name: 'web', selected: true, available: true },
      ],
      configuration: { kind: 'ready', config: { repo: ['api', 'web'] } },
      skipped: [],
    })
  })

  test('reports missing configured repositories as unavailable candidates', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    const result = await discoverWorkspaceRepositories(root, {
      probeRepository,
      readConfig: async () => ({ kind: 'ready', config: { repo: ['api', 'web'] } }),
    })

    expect(result).toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: api, name: 'api' }],
      candidates: [
        { id: api, name: 'api', selected: true, available: true },
        { id: path.join(root, 'web'), name: 'web', selected: true, available: false },
      ],
      configuration: { kind: 'ready', config: { repo: ['api', 'web'] } },
      skipped: [],
    })
  })

  test('keeps candidates visible but disables effective membership for invalid config', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    const result = await discoverWorkspaceRepositories(root, {
      probeRepository,
      readConfig: async () => ({ kind: 'invalid', message: 'workspace.config.read-failed' }),
    })

    expect(result).toEqual({
      ok: true,
      rootId: root,
      repositories: [],
      candidates: [{ id: api, name: 'api', selected: false, available: true }],
      configuration: { kind: 'invalid', message: 'workspace.config.read-failed' },
      skipped: [],
    })
  })
})

describe('restoreWorkspaceRepositories', () => {
  test('validates only configured local members and keeps unavailable members without skipped issues', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const web = await createGitDirectory(root, 'web')
    const unrelated = await createGitDirectory(root, 'unrelated')
    const probeRepository = vi.fn(async (cwd: string): Promise<ProbeResult> => {
      if (cwd === root) return { ok: true, root, name: path.basename(root), isGitRepo: false }
      if (cwd === api) return { ok: false, message: 'error.path-not-found' }
      if (cwd === web) return { ok: true, root: web, name: 'web', isGitRepo: true }
      throw new Error(`unexpected probe: ${cwd}`)
    })

    await expect(
      restoreWorkspaceRepositories(root, {
        probeRepository,
        readConfig: async () => ({ kind: 'ready', config: { repo: ['web', 'api'] } }),
      }),
    ).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: web, name: 'web' }],
      candidates: [
        { id: web, name: 'web', selected: true, available: true },
        { id: api, name: 'api', selected: true, available: false },
      ],
      configuration: { kind: 'ready', config: { repo: ['web', 'api'] } },
      skipped: [],
    })
    expect(probeRepository).toHaveBeenCalledWith(root)
    expect(probeRepository).toHaveBeenCalledWith(web)
    expect(probeRepository).toHaveBeenCalledWith(api)
    expect(probeRepository).not.toHaveBeenCalledWith(unrelated)
  })

  test('validates only configured remote members without listing workspace directories', async () => {
    const target = normalizeRemoteTarget({
      alias: 'prod',
      host: 'example.com',
      user: 'alice',
      port: 22,
      remotePath: '/srv/workspace',
    })!
    const rootId = normalizeRemoteRepoId(target)
    const api = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/api' })!
    const web = normalizeRemoteRepoRef({ alias: 'prod', remotePath: '/srv/workspace/web' })!
    const runRemote = vi.fn(async (_target, command: RemoteCommandKind): Promise<RemoteCommandResult> => {
      if (command.type !== 'testWorkspaceGitDirectory') throw new Error(`unexpected command: ${command.type}`)
      return command.path.endsWith('/api') ? remoteOk() : remoteFail('missing')
    })

    await expect(
      restoreWorkspaceRepositories(rootId, {
        probeRepository: async () => ({ ok: true, root: rootId, name: 'prod:workspace', isGitRepo: false }),
        resolveRemoteTarget: async () => ({ target }),
        runRemote,
        readConfig: async () => ({ kind: 'ready', config: { repo: ['api', 'web'] } }),
      }),
    ).resolves.toEqual({
      ok: true,
      rootId,
      repositories: [{ id: api.id, name: 'api', remoteRef: api }],
      candidates: [
        { id: api.id, name: 'api', remoteRef: api, selected: true, available: true },
        { id: web.id, name: 'web', remoteRef: web, selected: true, available: false },
      ],
      configuration: { kind: 'ready', config: { repo: ['api', 'web'] } },
      skipped: [],
    })
    expect(runRemote).toHaveBeenCalledTimes(2)
    expect(runRemote.mock.calls.map(([, command]) => command)).toEqual([
      { type: 'testWorkspaceGitDirectory', path: '/srv/workspace/api' },
      { type: 'testWorkspaceGitDirectory', path: '/srv/workspace/web' },
    ])
  })

  test('falls back to complete discovery when workspace configuration is missing', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    await expect(
      restoreWorkspaceRepositories(root, {
        probeRepository,
        readConfig: async () => ({ kind: 'missing' }),
      }),
    ).resolves.toEqual({
      ok: true,
      rootId: root,
      repositories: [{ id: api, name: 'api' }],
      candidates: [{ id: api, name: 'api', selected: false, available: true }],
      configuration: { kind: 'missing' },
      skipped: [],
    })
  })
})

function remoteOk(stdout = ''): RemoteCommandResult {
  return { ok: true, stdout, stderr: '' }
}

function remoteFail(message: string): RemoteCommandResult {
  return { ok: false, stdout: '', stderr: message, message }
}
