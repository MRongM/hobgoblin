import { mkdtemp, mkdir, readFile, rm, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { expect, test } from 'vitest'

test('materializes independent Git objects and intentional remotes from a linked source without switching it', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-clone-')))
  try {
    const source = path.join(root, 'source'),
      linked = path.join(root, 'linked'),
      folder = path.join(root, 'feature set'),
      target = path.join(folder, 'api')
    await mkdir(folder)
    await execa('git', ['init', '-b', 'main', source])
    await writeFile(path.join(source, 'tracked'), 'initial')
    await execa('git', ['-C', source, 'add', '.'])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '-m',
      'Initial',
    ])
    await execa('git', ['-C', source, 'remote', 'add', 'upstream', 'https://example.com/source.git'])
    await execa('git', ['-C', source, 'worktree', 'add', '-b', 'source-branch', linked])
    const { materializeBranchWorkspaceRepository } =
      await import('#/server/modules/branch-workspace-repository-source.ts')
    const created = await materializeBranchWorkspaceRepository(root, {
      memberId: 'member-copy',
      source: { kind: 'repository', repositoryId: linked },
      worktreePath: target,
      mode: { kind: 'newBranch', newBranch: 'target-branch', creationBase: { kind: 'localBranch', branch: 'main' } },
    })
    expect(created, created.message).toMatchObject({ ok: true })
    expect((await execa('git', ['-C', linked, 'branch', '--show-current'])).stdout).toBe('source-branch')
    expect((await execa('git', ['-C', target, 'branch', '--show-current'])).stdout).toBe('target-branch')
    expect((await execa('git', ['-C', target, 'config', '--get', 'hobgoblin.subworkspaceMemberId'])).stdout).toBe(
      'member-copy',
    )
    expect((await execa('git', ['-C', target, 'rev-parse', '--git-common-dir'])).stdout).toBe('.git')
    expect((await execa('git', ['-C', target, 'remote', 'get-url', 'upstream'])).stdout).toBe(
      'https://example.com/source.git',
    )
    expect((await execa('git', ['-C', target, 'remote'])).stdout).toBe('upstream')
    await expect(readFile(path.join(target, '.git', 'objects', 'info', 'alternates'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await rm(source, { recursive: true, force: true })
    await rm(linked, { recursive: true, force: true })
    expect((await execa('git', ['-C', target, 'show', 'HEAD:tracked'])).stdout).toBe('initial')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('creates a mixed folder, preserves switched member identity after source removal, and removes only targets with approval', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-mixed-')))
  try {
    const source = path.join(root, 'source')
    await execa('git', ['init', '-b', 'main', source])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial',
    ])
    const { readBranchWorkspaceManifests, updateBranchWorkspaceManifests } =
      await import('#/server/modules/branch-workspace-source.ts')
    const { readBranchWorkspaceSnapshot } = await import('#/server/modules/branch-workspace-read.ts')
    const { createBranchWorkspaceWriteService } = await import('#/server/modules/branch-workspace-write-paths.ts')
    const { buildBranchWorkspaceGitActionPlan } = await import('#/server/modules/branch-workspace-git-action-plan.ts')
    const dataFile = path.join(root, 'registry.json')
    const readManifests = async (rootId: string) => readBranchWorkspaceManifests(rootId, { dataFile })
    const readConfig = async () => ({ kind: 'missing' as const })
    const readSnapshot = async (rootId: string, signal?: AbortSignal) =>
      readBranchWorkspaceSnapshot(rootId, signal, { readManifests, readConfig })
    const service = createBranchWorkspaceWriteService({
      readManifests,
      readSnapshot,
      updateManifests: async (rootId, mutate) => updateBranchWorkspaceManifests(rootId, mutate, { dataFile }),
      planDependencies: { readManifests, readConfig },
      publishInvalidation: () => {},
    })
    const plan = await service.plan(root, {
      operation: 'create',
      directoryName: 'feature set',
      repositories: [
        {
          kind: 'worktree',
          repositoryName: 'linked',
          source: { kind: 'repository', repositoryId: source },
          targetBranch: 'feat/linked',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
        {
          kind: 'repository',
          repositoryName: 'copy',
          source: { kind: 'repository', repositoryId: source },
          targetBranch: 'main',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
      ],
      auxiliaryEntries: [],
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error(plan.message)
    expect(await service.execute(root, { planToken: plan.plan.token, approvals: [] })).toMatchObject({ ok: true })
    const copy = path.join(root, 'feature set', 'copy')
    await execa('git', ['-C', copy, 'checkout', '-b', 'switched'])
    await writeFile(path.join(copy, 'untracked'), 'change')
    const read = await readSnapshot(root)
    expect(read).toMatchObject({
      ok: true,
      items: [
        {
          id: plan.plan.branchWorkspaceId,
          repositories: [{ ready: true }, { repositoryId: copy, currentBranch: 'switched', ready: true }],
        },
      ],
    })
    const action = await buildBranchWorkspaceGitActionPlan(
      root,
      { kind: 'batch-discard', branchWorkspaceId: plan.plan.branchWorkspaceId },
      { readManifests },
    )
    expect(action).toMatchObject({
      ok: true,
      plan: { members: expect.arrayContaining([expect.objectContaining({ repoId: copy, targetBranch: 'switched' })]) },
    })
    const remove = await service.plan(root, {
      operation: 'remove',
      branchWorkspaceId: plan.plan.branchWorkspaceId,
      alsoDeleteBranch: false,
      alsoDeleteUpstream: false,
    })
    expect(remove.ok).toBe(true)
    if (!remove.ok) throw new Error(remove.message)
    expect(remove.plan.requiredApprovals).toContain('delete-repository')
    expect(remove.plan.repositories).toMatchObject([
      { action: 'remove-worktree' },
      { kind: 'repository', action: 'remove-entry', dirty: true },
    ])
    expect(await service.execute(root, { planToken: remove.plan.token, approvals: [] })).toMatchObject({
      ok: false,
      message: 'workspace.branch-workspace.approval-required',
    })
    expect(
      await service.execute(root, { planToken: remove.plan.token, approvals: remove.plan.requiredApprovals }),
    ).toMatchObject({ ok: true })
    expect((await execa('git', ['-C', source, 'branch', '--show-current'])).stdout).toBe('main')
    await expect(readFile(path.join(copy, '.git', 'HEAD'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { buildRemoteCommandInvocation } from '#/system/ssh/commands.ts'
import {
  materializeBranchWorkspaceRepository,
  inspectBranchWorkspaceRepository,
} from '#/server/modules/branch-workspace-repository-source.ts'
import { normalizeRemoteRepoId, normalizeRemoteTarget } from '#/shared/remote-repo.ts'

test.each([undefined, 'wsl'] as const)(
  'executes clone and delete-preview through the owning %s host adapter',
  async (transport) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-host-')))
    try {
      const source = path.join(root, 'source'),
        folder = path.join(root, 'folder'),
        targetPath = path.join(folder, 'copy')
      await mkdir(folder)
      await execa('git', ['init', '-b', 'main', source])
      await execa('git', [
        '-C',
        source,
        '-c',
        'user.name=Developer',
        '-c',
        'user.email=developer@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'Initial',
      ])
      await execa('git', ['-C', source, 'remote', 'add', 'upstream', 'https://example.com/repository.git'])
      const rootId = normalizeRemoteRepoId({ alias: 'host', remotePath: root, ...(transport ? { transport } : {}) })
      const sourceId = normalizeRemoteRepoId({ alias: 'host', remotePath: source, ...(transport ? { transport } : {}) })
      const target = normalizeRemoteTarget({
        alias: 'host',
        host: 'example.com',
        user: 'developer',
        port: 22,
        remotePath: root,
        ...(transport ? { transport, wslExecutable: 'wsl.exe' } : {}),
      })!
      const dependencies = {
        resolveRemoteTarget: async () => ({ target }),
        runRemote: async (_target: typeof target, command: Parameters<typeof buildRemoteCommandInvocation>[1]) => {
          expect(_target).toBe(target)
          const script = buildRemoteCommandInvocation(target, command).script
          const result = await execa('sh', ['-c', script])
          return { ok: true, stdout: result.stdout, stderr: result.stderr }
        },
      }
      expect(
        await materializeBranchWorkspaceRepository(
          rootId,
          {
            source: { kind: 'repository', repositoryId: sourceId },
            worktreePath: targetPath,
            mode: { kind: 'existingBranch', branch: 'main' },
          },
          undefined,
          dependencies,
        ),
      ).toMatchObject({ ok: true })
      expect((await execa('git', ['-C', targetPath, 'remote', 'get-url', 'upstream'])).stdout).toBe(
        'https://example.com/repository.git',
      )
      expect(await inspectBranchWorkspaceRepository(rootId, targetPath, undefined, dependencies)).toMatchObject({
        dirty: false,
        localOnlyCommits: 1,
        repositoryFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test('can create from a remote-tracking source ref while preserving its upstream configuration', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-tracking-')))
  try {
    const source = path.join(root, 'source'),
      folder = path.join(root, 'folder'),
      targetPath = path.join(folder, 'copy')
    await mkdir(folder)
    await execa('git', ['init', '-b', 'main', source])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial',
    ])
    await execa('git', ['-C', source, 'remote', 'add', 'upstream', 'https://example.com/source.git'])
    await execa('git', ['-C', source, 'update-ref', 'refs/remotes/upstream/topic', 'HEAD'])
    await execa('git', ['-C', source, 'config', 'branch.main.remote', 'upstream'])
    await execa('git', ['-C', source, 'config', 'branch.main.merge', 'refs/heads/topic'])
    expect(
      await materializeBranchWorkspaceRepository(root, {
        source: { kind: 'repository', repositoryId: source },
        worktreePath: targetPath,
        mode: { kind: 'trackRemoteBranch', remoteRef: 'upstream/topic', localBranch: 'feature' },
      }),
    ).toMatchObject({ ok: true })
    expect((await execa('git', ['-C', targetPath, 'rev-parse', '--abbrev-ref', 'feature@{upstream}'])).stdout).toBe(
      'upstream/topic',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete member reads and detached repair remain independent of a missing source', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-independent-')))
  try {
    const source = path.join(root, 'source'),
      folder = path.join(root, 'folder'),
      targetPath = path.join(folder, 'copy')
    await mkdir(folder)
    await execa('git', ['init', '-b', 'main', source])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial',
    ])
    expect(
      await materializeBranchWorkspaceRepository(root, {
        memberId: 'member-copy',
        source: { kind: 'repository', repositoryId: source },
        worktreePath: targetPath,
        mode: { kind: 'existingBranch', branch: 'main' },
      }),
    ).toMatchObject({ ok: true })
    await execa('git', ['-C', targetPath, 'checkout', '--detach', 'HEAD'])
    await rm(source, { recursive: true, force: true })
    const { readBranchWorkspaceManifests, replaceBranchWorkspaceManifests } =
      await import('#/server/modules/branch-workspace-source.ts')
    const { readBranchWorkspaceSnapshot } = await import('#/server/modules/branch-workspace-read.ts')
    const { buildBranchWorkspacePlan } = await import('#/server/modules/branch-workspace-plan.ts')
    const dataFile = path.join(root, 'registry.json')
    const manifest = {
      id: 'folder-id',
      rootId: root,
      branch: '',
      directoryName: 'folder',
      path: folder,
      repositories: [
        {
          memberId: 'member-copy',
          kind: 'repository' as const,
          source: { kind: 'repository' as const, repositoryId: source },
          repositoryId: targetPath,
          repositoryName: 'copy',
          targetBranch: 'main',
          creationBase: { kind: 'localBranch' as const, branch: 'main' },
          syncBeforeCreate: false,
          branchOrigin: 'pre-existing' as const,
          worktreePath: targetPath,
          progress: 'complete' as const,
        },
      ],
      auxiliaryEntries: [],
    }
    await replaceBranchWorkspaceManifests(root, [manifest], { dataFile })
    const readManifests = async (rootId: string) => readBranchWorkspaceManifests(rootId, { dataFile })
    expect(
      await readBranchWorkspaceSnapshot(root, undefined, {
        readManifests,
        readConfig: async () => ({ kind: 'missing' }),
      }),
    ).toMatchObject({
      ok: true,
      items: [
        {
          id: 'folder-id',
          state: { kind: 'ready' },
          repositories: [{ repositoryId: targetPath, targetBranch: 'main', currentBranch: null, ready: true }],
        },
      ],
    })
    expect(
      await buildBranchWorkspacePlan(root, { operation: 'repair', branchWorkspaceId: 'folder-id' }, { readManifests }),
    ).toEqual({ ok: false, message: 'workspace.branch-workspace.nothing-to-repair' })
    await execa('git', ['-C', targetPath, 'config', 'hobgoblin.subworkspaceMemberId', 'different-owner'])
    await execa('git', ['-C', targetPath, 'checkout', 'main'])
    const { buildBranchWorkspaceGitActionPlan } = await import('#/server/modules/branch-workspace-git-action-plan.ts')
    expect(
      await buildBranchWorkspaceGitActionPlan(
        root,
        { kind: 'batch-discard', branchWorkspaceId: 'folder-id' },
        { readManifests },
      ),
    ).toMatchObject({ ok: false, message: 'workspace.branch-workspace.repository-unavailable' })
    expect(
      await readBranchWorkspaceSnapshot(root, undefined, {
        readManifests,
        readConfig: async () => ({ kind: 'missing' }),
      }),
    ).toMatchObject({ ok: true, items: [{ state: { kind: 'needs-action' }, repositories: [{ ready: false }] }] })
    expect(
      await buildBranchWorkspacePlan(
        root,
        { operation: 'remove', branchWorkspaceId: 'folder-id', alsoDeleteBranch: false, alsoDeleteUpstream: false },
        { readManifests },
      ),
    ).toMatchObject({ ok: false, message: 'workspace.branch-workspace.repository-unavailable' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('deletion preview binds exact staged contents even when status and final worktree contents match', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-index-')))
  try {
    const target = path.join(root, 'folder', 'copy')
    await mkdir(path.dirname(target))
    await execa('git', ['init', '-b', 'main', target])
    const file = path.join(target, 'tracked')
    await writeFile(file, 'original')
    await execa('git', ['-C', target, 'add', '.'])
    await execa('git', [
      '-C',
      target,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '-m',
      'Initial',
    ])
    await writeFile(file, 'staged-one')
    await execa('git', ['-C', target, 'add', '.'])
    await writeFile(file, 'final')
    const first = await inspectBranchWorkspaceRepository(root, target)
    await writeFile(file, 'staged-two')
    await execa('git', ['-C', target, 'add', '.'])
    await writeFile(file, 'final')
    const second = await inspectBranchWorkspaceRepository(root, target)
    expect(second.repositoryFingerprint).not.toBe(first.repositoryFingerprint)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('exclusive publication preserves a competing empty directory and existing contents', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-publication-')))
  try {
    const staging = path.join(root, 'staged'),
      target = path.join(root, 'folder', 'copy')
    await mkdir(staging)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(staging, 'tracked'), 'source')
    const { publishBranchWorkspaceRepository } = await import('#/server/modules/branch-workspace-repository-source.ts')
    await expect(publishBranchWorkspaceRepository(root, staging, target)).rejects.toThrow(
      'workspace.branch-workspace.target-exists',
    )
    await writeFile(path.join(target, 'user-content'), 'preserved')
    await expect(publishBranchWorkspaceRepository(root, staging, target)).rejects.toThrow(
      'workspace.branch-workspace.target-exists',
    )
    expect(await readFile(path.join(target, 'user-content'), 'utf8')).toBe('preserved')
    await expect(readFile(path.join(target, 'tracked'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed and cancelled clones leave no unowned target and can be retried', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-retry-')))
  try {
    const source = path.join(root, 'source'),
      folder = path.join(root, 'folder'),
      targetPath = path.join(folder, 'copy')
    await mkdir(folder)
    await execa('git', ['init', '-b', 'main', source])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial',
    ])
    const input = { source: { kind: 'repository' as const, repositoryId: source }, worktreePath: targetPath }
    expect(
      await materializeBranchWorkspaceRepository(root, {
        ...input,
        mode: { kind: 'existingBranch', branch: 'missing' },
      }),
    ).toMatchObject({ ok: false })
    await expect(readFile(path.join(targetPath, '.git', 'HEAD'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await materializeBranchWorkspaceRepository(root, input, AbortSignal.abort())).toMatchObject({
      ok: false,
      message: 'cancelled',
    })
    expect(await materializeBranchWorkspaceRepository(root, input)).toMatchObject({ ok: true })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === 'win32')(
  'retains durable ownership when cancelled after the last final file is published',
  async () => {
    const { watch } = await import('node:fs')
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-publication-cancel-')))
    const originalPath = process.env.PATH
    let watcher: ReturnType<typeof watch> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const source = path.join(root, 'source'),
        folder = path.join(root, 'folder'),
        target = path.join(folder, 'copy'),
        bin = path.join(root, 'bin')
      await mkdir(folder)
      await mkdir(bin)
      await execa('git', ['init', '-b', 'main', source])
      await writeFile(path.join(source, 'tracked'), Buffer.alloc(1024 * 1024, 97))
      await execa('git', ['-C', source, 'add', '.'])
      await execa('git', [
        '-C',
        source,
        '-c',
        'user.name=Developer',
        '-c',
        'user.email=developer@example.com',
        'commit',
        '-m',
        'Initial',
      ])
      const realGit = (await execa('which', ['git'])).stdout
      await writeFile(
        path.join(bin, 'git'),
        `#!/usr/bin/env python3\nimport os,sys,time\nif "hobgoblin.subworkspaceMemberId" in sys.argv and os.getcwd() == ${JSON.stringify(target)}: time.sleep(0.3)\nos.execv(${JSON.stringify(realGit)},["git"]+sys.argv[1:])\n`,
        { mode: 0o755 },
      )
      process.env.PATH = `${bin}:${originalPath}`
      const controller = new AbortController()
      const published = new Promise<void>((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('final publication was not observed')), 5000)
        watcher = watch(folder, { recursive: true }, (_event, name) => {
          if (String(name) !== 'copy/tracked') return
          controller.abort()
          clearTimeout(deadline)
          resolve()
        })
      })
      const [result] = await Promise.all([
        materializeBranchWorkspaceRepository(
          root,
          { memberId: 'member-copy', source: { kind: 'repository', repositoryId: source }, worktreePath: target },
          controller.signal,
        ),
        published,
      ])
      expect(controller.signal.aborted).toBe(true)
      expect(result.ok || result.message === 'cancelled').toBe(true)
      process.env.PATH = originalPath
      expect((await execa('git', ['-C', target, 'config', '--get', 'hobgoblin.subworkspaceMemberId'])).stdout).toBe(
        'member-copy',
      )
      expect(await readFile(path.join(target, 'tracked'))).toEqual(Buffer.alloc(1024 * 1024, 97))
      expect(await inspectBranchWorkspaceRepository(root, target)).toMatchObject({
        memberId: 'member-copy',
        dirty: false,
      })
    } finally {
      process.env.PATH = originalPath
      watcher?.close()
      clearTimeout(deadline)
      await rm(root, { recursive: true, force: true })
    }
  },
)

test('a member created from an already linked source uses the primary execution identity and retains its provenance', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-linked-source-')))
  try {
    const source = path.join(root, 'source'),
      linked = path.join(root, 'linked')
    await execa('git', ['init', '-b', 'main', source])
    await execa('git', [
      '-C',
      source,
      '-c',
      'user.name=Developer',
      '-c',
      'user.email=developer@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial',
    ])
    await execa('git', ['-C', source, 'worktree', 'add', '-b', 'source-branch', linked])
    const { readBranchWorkspaceManifests, updateBranchWorkspaceManifests } =
      await import('#/server/modules/branch-workspace-source.ts')
    const { readBranchWorkspaceSnapshot } = await import('#/server/modules/branch-workspace-read.ts')
    const { createBranchWorkspaceWriteService } = await import('#/server/modules/branch-workspace-write-paths.ts')
    const dataFile = path.join(root, 'registry.json')
    const readManifests = (rootId: string) => readBranchWorkspaceManifests(rootId, { dataFile })
    const readConfig = async () => ({ kind: 'missing' as const })
    const readSnapshot = (rootId: string, signal?: AbortSignal) =>
      readBranchWorkspaceSnapshot(rootId, signal, { readManifests, readConfig })
    const service = createBranchWorkspaceWriteService({
      readManifests,
      readSnapshot,
      updateManifests: (rootId, mutate) => updateBranchWorkspaceManifests(rootId, mutate, { dataFile }),
      planDependencies: { readManifests, readConfig },
      publishInvalidation: () => {},
    })
    const planned = await service.plan(root, {
      operation: 'create',
      directoryName: 'folder',
      repositories: [
        {
          kind: 'worktree',
          repositoryName: 'copy',
          source: { kind: 'repository', repositoryId: linked },
          targetBranch: 'target-branch',
          creationBase: { kind: 'localBranch', branch: 'main' },
        },
      ],
      auxiliaryEntries: [],
    })
    expect(planned).toMatchObject({
      ok: true,
      plan: {
        repositories: [{ repoId: source, source: { kind: 'repository', repositoryId: linked } }],
        manifest: { repositories: [{ repositoryId: source, source: { kind: 'repository', repositoryId: linked } }] },
      },
    })
    if (!planned.ok) throw new Error(planned.message)
    expect(await service.execute(root, { planToken: planned.plan.token, approvals: [] })).toMatchObject({ ok: true })
    expect(await readSnapshot(root)).toMatchObject({
      ok: true,
      items: [
        {
          state: { kind: 'ready' },
          repositories: [{ repositoryId: source, ready: true, currentBranch: 'target-branch' }],
        },
      ],
    })
    expect((await execa('git', ['-C', linked, 'branch', '--show-current'])).stdout).toBe('source-branch')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.each([undefined, 'wsl'] as const)(
  'owning %s host exposes a marked repository before publication-boundary cancellation',
  async (transport) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-host-cancel-')))
    try {
      const source = path.join(root, 'source'),
        folder = path.join(root, 'folder'),
        targetPath = path.join(folder, 'copy')
      await mkdir(folder)
      await execa('git', ['init', '-b', 'main', source])
      await execa('git', [
        '-C',
        source,
        '-c',
        'user.name=Developer',
        '-c',
        'user.email=developer@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'Initial',
      ])
      const rootId = normalizeRemoteRepoId({ alias: 'host', remotePath: root, ...(transport ? { transport } : {}) })
      const sourceId = normalizeRemoteRepoId({ alias: 'host', remotePath: source, ...(transport ? { transport } : {}) })
      const target = normalizeRemoteTarget({
        alias: 'host',
        host: 'example.com',
        user: 'developer',
        port: 22,
        remotePath: root,
        ...(transport ? { transport, wslExecutable: 'wsl.exe' } : {}),
      })!
      const result = await materializeBranchWorkspaceRepository(
        rootId,
        { memberId: 'member-copy', source: { kind: 'repository', repositoryId: sourceId }, worktreePath: targetPath },
        undefined,
        {
          resolveRemoteTarget: async () => ({ target }),
          runRemote: async (_target, command) => {
            let script = buildRemoteCommandInvocation(target, command).script
            if (command.type === 'materializeBranchWorkspaceRepository')
              script = script.replace(
                '        shutil.copytree(checkout, target, symlinks=True, dirs_exist_ok=True, copy_function=exclusive_copy)',
                '        shutil.copytree(checkout, target, symlinks=True, dirs_exist_ok=True, copy_function=exclusive_copy)\n        sys.exit(130)',
              )
            const executed = await execa('sh', ['-c', script], { reject: false })
            return {
              ok: executed.exitCode === 0,
              stdout: executed.stdout,
              stderr: executed.stderr,
              ...(executed.exitCode === 130 ? { message: 'cancelled' } : {}),
            }
          },
        },
      )
      expect(result).toMatchObject({ ok: false, message: 'cancelled' })
      expect((await execa('git', ['-C', targetPath, 'config', '--get', 'hobgoblin.subworkspaceMemberId'])).stdout).toBe(
        'member-copy',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
