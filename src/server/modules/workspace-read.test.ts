import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { discoverWorkspaceRepositories } from '#/server/modules/workspace-read.ts'
import type { ProbeResult } from '#/shared/rpc.ts'

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
  test('discovers only immediate real directories with git markers in natural name order', async () => {
    const root = await createTemporaryRoot()
    const api = await createGitDirectory(root, 'api')
    const web2 = await createGitDirectory(root, 'web2', 'file')
    const web10 = await createGitDirectory(root, 'web10')
    const nested = path.join(root, 'nested')
    await createGitDirectory(nested, 'child')
    await symlink(path.join(nested, 'child'), path.join(root, 'linked'))

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
    expect(probeRepository).not.toHaveBeenCalledWith(path.join(root, 'linked'))
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
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nrepo = ["api", "web"]\n')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    await expect(discoverWorkspaceRepositories(root, { probeRepository })).resolves.toEqual({
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
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nrepo = ["api", "web"]\n')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    const result = await discoverWorkspaceRepositories(root, { probeRepository })

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
    await writeFile(path.join(root, 'goblin.toml'), '[workspace]\nrepo = ["api", "api"]\n')
    const probeRepository = vi.fn(
      async (cwd: string): Promise<ProbeResult> => ({
        ok: true,
        root: cwd,
        name: path.basename(cwd),
        isGitRepo: cwd !== root,
      }),
    )

    const result = await discoverWorkspaceRepositories(root, { probeRepository })

    expect(result).toEqual({
      ok: true,
      rootId: root,
      repositories: [],
      candidates: [{ id: api, name: 'api', selected: false, available: true }],
      configuration: { kind: 'invalid', message: 'workspace.config.duplicate-repository' },
      skipped: [],
    })
  })
})
