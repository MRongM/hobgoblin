import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, expect, test } from 'vitest'
import {
  readBranchWorkspaceExecutionManifests,
  readBranchWorkspaceManifests,
  registerBranchWorkspaceFolder,
  updateBranchWorkspaceManifests,
} from '#/server/modules/branch-workspace-source.ts'
import { removeBranchWorkspaceEntry } from '#/server/modules/branch-workspace-materialization-source.ts'
import { removeRepositoryWorktree } from '#/server/modules/repo-write-paths.ts'
import {
  createBranchWorkspaceWriteService,
  type BranchWorkspaceWriteDependencies,
} from '#/server/modules/branch-workspace-write-paths.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function initRepository(target: string) {
  await execa('git', ['init', '-b', 'main', target])
  await execa('git', [
    '-C',
    target,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'Initial',
  ])
}

async function fixture() {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'subworkspace-delete-')))
  directories.push(directory)
  const root = path.join(directory, 'workspace')
  const folder = path.join(root, 'example')
  const dataFile = path.join(directory, 'registry.json')
  await mkdir(root)
  return {
    directory,
    root,
    folder,
    async register(overrides: BranchWorkspaceWriteDependencies = {}) {
      const { branchWorkspaceId } = await registerBranchWorkspaceFolder(root, folder, { dataFile })
      const service = createBranchWorkspaceWriteService({
        readManifests: async (id) => readBranchWorkspaceExecutionManifests(id, { dataFile }),
        updateManifests: async (id, mutate) => updateBranchWorkspaceManifests(id, mutate, { dataFile }),
        planDependencies: { readManifests: async (id) => readBranchWorkspaceManifests(id, { dataFile }) },
        publishInvalidation: () => {},
        ...overrides,
      })
      const plan = await service.plan(root, {
        operation: 'remove',
        branchWorkspaceId,
        alsoDeleteBranch: false,
        alsoDeleteUpstream: false,
      })
      expect(plan, JSON.stringify(plan)).toMatchObject({ ok: true })
      if (!plan.ok) throw new Error(plan.message)
      return {
        service,
        plan: plan.plan,
        execute: () => service.execute(root, { planToken: plan.plan.token, approvals: plan.plan.requiredApprovals }),
        read: () => readBranchWorkspaceManifests(root, { dataFile }),
      }
    },
  }
}

test('deletes worktrees, independent repositories and all remaining files before unregistering the folder', async () => {
  const f = await fixture()
  const source = path.join(f.directory, 'source')
  await initRepository(source)
  await mkdir(f.folder)
  const linked = path.join(f.folder, 'linked')
  await execa('git', ['-C', source, 'worktree', 'add', '-b', 'feature/example', linked])
  const repository = path.join(f.folder, 'repository')
  await initRepository(repository)
  await writeFile(path.join(linked, 'untracked.txt'), 'local work')
  await mkdir(path.join(f.folder, 'notes'))
  await writeFile(path.join(f.folder, 'notes', '.hidden'), 'notes')
  const events: string[] = []
  const deletion = await f.register({
    removeWorktree: async (...args) => {
      events.push('worktree')
      return await removeRepositoryWorktree(...args)
    },
    removeEntry: async (...args) => {
      events.push(args[1])
      await removeBranchWorkspaceEntry(...args)
    },
  })
  expect(deletion.plan.steps.at(-1)?.kind).toBe('remove-directory')
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(events.indexOf('worktree')).toBeLessThan(events.indexOf(repository))
  expect(events.at(-1)).toBe(f.folder)
  expect((await execa('git', ['-C', source, 'worktree', 'list', '--porcelain'])).stdout).not.toContain(linked)
  expect((await execa('git', ['-C', source, 'branch', '--list', 'feature/example'])).stdout).toContain(
    'feature/example',
  )
  expect(await deletion.read()).toMatchObject({ kind: 'ready', manifests: [] })
})

test.each(['worktree', 'repository'])('deletes a folder whose root itself is a %s', async (kind) => {
  const f = await fixture()
  if (kind === 'worktree') {
    const source = path.join(f.directory, 'source')
    await initRepository(source)
    await execa('git', ['-C', source, 'worktree', 'add', '-b', 'feature/root', f.folder])
  } else await initRepository(f.folder)
  await writeFile(path.join(f.folder, 'untracked.txt'), 'local work')
  const deletion = await f.register()
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('removes sibling worktrees before deleting their primary repository inside the same folder', async () => {
  const f = await fixture()
  await mkdir(f.folder)
  const primary = path.join(f.folder, 'a-repository')
  const linked = path.join(f.folder, 'z-worktree')
  await initRepository(primary)
  await execa('git', ['-C', primary, 'worktree', 'add', '-b', 'feature/example', linked])
  const deletion = await f.register()
  expect(deletion.plan.repositories.map((repo) => repo.worktreePath)).toEqual([linked, primary])
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('unlinks external repository links without deleting their targets', async () => {
  const f = await fixture()
  const outside = path.join(f.directory, 'outside')
  await initRepository(outside)
  await writeFile(path.join(outside, 'keep.txt'), 'keep')
  await mkdir(f.folder)
  await symlink(outside, path.join(f.folder, 'linked-repository'), 'dir')
  const deletion = await f.register()
  expect(deletion.plan.repositories).toEqual([])
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('keep')
})

test('removes a worktree once when multiple directory entries refer to it', async () => {
  const f = await fixture()
  const source = path.join(f.directory, 'source')
  await initRepository(source)
  await mkdir(f.folder)
  const linked = path.join(f.folder, 'linked')
  await execa('git', ['-C', source, 'worktree', 'add', '-b', 'feature/example', linked])
  await symlink(linked, path.join(f.folder, 'alias'), 'dir')
  const deletion = await f.register()
  expect(deletion.plan.repositories).toHaveLength(1)
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('retains registration on cancellation and can finish the remaining deletion on retry', async () => {
  const f = await fixture()
  await mkdir(f.folder)
  await writeFile(path.join(f.folder, 'a.txt'), 'a')
  await writeFile(path.join(f.folder, 'b.txt'), 'b')
  let first = true
  const deletion = await f.register({
    removeEntry: async (...args) => {
      await removeBranchWorkspaceEntry(...args)
      if (first) {
        first = false
        deletion.service.abort(f.root)
      }
    },
  })
  expect(await deletion.execute()).toMatchObject({ ok: false, message: 'cancelled' })
  expect(await deletion.read()).toMatchObject({
    kind: 'ready',
    manifests: [expect.objectContaining({ path: f.folder })],
  })
  expect(await deletion.execute()).toMatchObject({ ok: true })
  await expect(lstat(f.folder)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('rejects changed plans before deleting any content', async () => {
  const f = await fixture()
  await mkdir(f.folder)
  await writeFile(path.join(f.folder, 'a.txt'), 'a')
  const deletion = await f.register()
  await writeFile(path.join(f.folder, 'new.txt'), 'new')
  expect(await deletion.execute()).toMatchObject({ ok: false, message: 'workspace.branch-workspace.plan-stale' })
  expect(await readFile(path.join(f.folder, 'a.txt'), 'utf8')).toBe('a')
})

test('does not delete a primary repository if an external worktree was added before retrying', async () => {
  const f = await fixture()
  await mkdir(f.folder)
  const primary = path.join(f.folder, 'repository')
  await initRepository(primary)
  let first = true
  const deletion = await f.register({
    removeEntry: async (...args) => {
      if (first && args[1] === primary) {
        first = false
        throw new Error('interrupted')
      }
      await removeBranchWorkspaceEntry(...args)
    },
  })
  expect(await deletion.execute()).toMatchObject({ ok: false, message: 'interrupted' })
  const external = path.join(f.directory, 'external-worktree')
  await execa('git', ['-C', primary, 'worktree', 'add', '-b', 'feature/external', external])
  expect(await deletion.execute()).toMatchObject({
    ok: false,
    message: 'workspace.branch-workspace.worktree-elsewhere',
  })
  expect((await execa('git', ['-C', external, 'branch', '--show-current'])).stdout).toBe('feature/external')
})
