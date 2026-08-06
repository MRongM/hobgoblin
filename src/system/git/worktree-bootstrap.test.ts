import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import { promises as fs } from 'node:fs'
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { git } from '#/system/git/helper.ts'
import {
  bootstrapWorktreeSelectionsAfterCreate,
  getWorktreeBootstrapTargetPreflight,
} from '#/system/git/worktree-bootstrap.ts'

const mocks = vi.hoisted(() => ({
  getRepoRoot: vi.fn(),
}))

vi.mock('#/system/git/branches.ts', () => ({
  getRepoRoot: mocks.getRepoRoot,
}))

let tmp = ''
let sourceRoot = ''
let targetRoot = ''

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'worktree-bootstrap-test-'))
  sourceRoot = path.join(tmp, 'repo')
  targetRoot = path.join(tmp, 'repo-worktree')
  await mkdir(sourceRoot, { recursive: true })
  await mkdir(targetRoot, { recursive: true })
  await git(sourceRoot, ['init', '--quiet'])
  mocks.getRepoRoot.mockResolvedValue(sourceRoot)
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('worktree bootstrap', () => {
  test('classifies pending, satisfied, and conflicting manual targets without writing', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'source\n')
    await writeFile(path.join(sourceRoot, 'pending.env'), 'pending\n')
    await mkdir(path.join(sourceRoot, 'node_modules'))
    await writeFile(path.join(targetRoot, '.env'), 'target\n')
    await symlink(path.join(sourceRoot, 'node_modules'), path.join(targetRoot, 'node_modules'))

    const result = await getWorktreeBootstrapTargetPreflight(sourceRoot, targetRoot, {
      kind: 'materialize',
      selections: [
        { path: '.env', mode: 'copy' },
        { path: 'pending.env', mode: 'copy' },
        { path: 'node_modules', mode: 'symlink' },
      ],
    })

    expect(result).toEqual({
      ok: true,
      preflight: {
        pending: [{ path: 'pending.env', mode: 'copy' }],
        satisfied: [{ path: 'node_modules', mode: 'symlink' }],
        conflicts: [{ path: '.env', mode: 'copy' }],
        hasSetup: false,
      },
    })
    await expect(readFile(path.join(targetRoot, '.env'), 'utf8')).resolves.toBe('target\n')
  })

  test('copies and symlinks deep untracked selections from the exact source worktree', async () => {
    await mkdir(path.join(sourceRoot, 'backend', '.venv'), { recursive: true })
    await writeFile(path.join(sourceRoot, 'backend', '.venv', 'pyvenv.cfg'), 'placeholder\n')
    await mkdir(path.join(sourceRoot, 'frontend', 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(sourceRoot, 'frontend', 'node_modules', 'pkg', 'index.js'), 'export {}\n')

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: 'backend/.venv', mode: 'symlink' },
      { path: 'frontend/node_modules', mode: 'copy' },
    ])

    expect(result).toEqual({
      ok: true,
      message: 'Copied 1 path: frontend/node_modules\nSymlinked 1 path: backend/.venv',
      worktreeBootstrap: {
        copy: { count: 1, paths: ['frontend/node_modules'] },
        symlink: { count: 1, paths: ['backend/.venv'] },
        hardlink: { count: 0, paths: [] },
        skippedMissing: { count: 0, paths: [] },
      },
    })
    await expect(readlink(path.join(targetRoot, 'backend', '.venv'))).resolves.toBe(
      path.join(sourceRoot, 'backend', '.venv'),
    )
    await expect(readFile(path.join(targetRoot, 'frontend', 'node_modules', 'pkg', 'index.js'), 'utf8')).resolves.toBe(
      'export {}\n',
    )
  })

  test('skips tracked files and directories containing tracked files while continuing later selections', async () => {
    await writeFile(path.join(sourceRoot, 'tracked.env'), 'tracked\n')
    await mkdir(path.join(sourceRoot, 'mixed'), { recursive: true })
    await writeFile(path.join(sourceRoot, 'mixed', 'tracked.txt'), 'tracked\n')
    await writeFile(path.join(sourceRoot, 'mixed', 'untracked.txt'), 'untracked\n')
    await writeFile(path.join(sourceRoot, 'later.env'), 'later\n')
    await git(sourceRoot, ['add', '--', 'tracked.env', 'mixed/tracked.txt'])

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: 'tracked.env', mode: 'copy' },
      { path: 'mixed', mode: 'copy' },
      { path: 'later.env', mode: 'copy' },
    ])

    expect(result).toMatchObject({
      ok: true,
      worktreeBootstrap: { copy: { count: 1, paths: ['later.env'] } },
    })
    await expect(readFile(path.join(targetRoot, 'later.env'), 'utf8')).resolves.toBe('later\n')
    await expect(readFile(path.join(targetRoot, 'tracked.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(path.join(targetRoot, 'mixed', 'untracked.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('silently skips missing, symlinked, unsupported, escaping, and existing selections', async () => {
    const outsideSource = path.join(tmp, 'outside-source')
    const outsideTarget = path.join(tmp, 'outside-target')
    await mkdir(outsideSource)
    await mkdir(outsideTarget)
    await writeFile(path.join(outsideSource, 'escaped.env'), 'outside\n')
    await writeFile(path.join(sourceRoot, 'real.env'), 'real\n')
    await symlink(path.join(sourceRoot, 'real.env'), path.join(sourceRoot, 'linked.env'))
    await symlink(outsideSource, path.join(sourceRoot, 'escaped'))
    await mkdir(path.join(sourceRoot, 'frontend', 'node_modules'), { recursive: true })
    await symlink(outsideTarget, path.join(targetRoot, 'frontend'))
    await writeFile(path.join(sourceRoot, 'existing.env'), 'source\n')
    await writeFile(path.join(targetRoot, 'existing.env'), 'target\n')

    const socketPath = path.join(sourceRoot, 'unsupported.sock')
    const socket = createServer()
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.listen(socketPath, resolve)
    })
    try {
      const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
        { path: 'missing.env', mode: 'copy' },
        { path: 'linked.env', mode: 'copy' },
        { path: 'escaped/escaped.env', mode: 'copy' },
        { path: 'frontend/node_modules', mode: 'copy' },
        { path: 'existing.env', mode: 'copy' },
        { path: 'unsupported.sock', mode: 'copy' },
      ])

      expect(result).toEqual({ ok: true, message: '' })
      await expect(readFile(path.join(targetRoot, 'existing.env'), 'utf8')).resolves.toBe('target\n')
      await expect(readFile(path.join(outsideTarget, 'node_modules'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await new Promise<void>((resolve) => socket.close(() => resolve()))
    }
  })

  test('isolates copy and symlink failures and summarizes only later successes', async () => {
    await writeFile(path.join(sourceRoot, 'copy-fails.env'), 'copy\n')
    await mkdir(path.join(sourceRoot, 'link-fails'))
    await writeFile(path.join(sourceRoot, 'later.env'), 'later\n')
    const copy = vi.spyOn(fs, 'cp').mockRejectedValueOnce(new Error('copy interrupted'))
    const link = vi.spyOn(fs, 'symlink').mockRejectedValueOnce(new Error('link interrupted'))

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: 'copy-fails.env', mode: 'copy' },
      { path: 'link-fails', mode: 'symlink' },
      { path: 'later.env', mode: 'copy' },
    ])

    copy.mockRestore()
    link.mockRestore()
    expect(result).toMatchObject({
      ok: true,
      worktreeBootstrap: {
        copy: { count: 1, paths: ['later.env'] },
        symlink: { count: 0, paths: [] },
      },
    })
    await expect(readFile(path.join(targetRoot, 'later.env'), 'utf8')).resolves.toBe('later\n')
    await expect(readFile(path.join(targetRoot, 'copy-fails.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('treats Git query errors as silent skips', async () => {
    const nonRepositorySource = path.join(tmp, 'plain-directory')
    await mkdir(nonRepositorySource)
    await writeFile(path.join(nonRepositorySource, 'local.env'), 'local\n')

    await expect(
      bootstrapWorktreeSelectionsAfterCreate(nonRepositorySource, targetRoot, [
        { path: 'local.env', mode: 'copy' },
      ]),
    ).resolves.toEqual({ ok: true, message: '' })
    await expect(readFile(path.join(targetRoot, 'local.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('stops remaining materialization after cancellation while preserving success', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [{ path: 'later.env', mode: 'copy' }], {
        signal: controller.signal,
      }),
    ).resolves.toEqual({ ok: true, message: '' })
  })
})
