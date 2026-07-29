import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

  test('replaces only an approved existing copy target as a whole', async () => {
    await mkdir(path.join(sourceRoot, 'cache'))
    await writeFile(path.join(sourceRoot, 'cache', 'fresh.txt'), 'fresh\n')
    await mkdir(path.join(targetRoot, 'cache'))
    await writeFile(path.join(targetRoot, 'cache', 'stale.txt'), 'stale\n')

    const result = await bootstrapWorktreeSelectionsAfterCreate(
      sourceRoot,
      targetRoot,
      [{ path: 'cache', mode: 'copy' }],
      { replaceExisting: [{ path: 'cache', mode: 'copy' }] },
    )

    expect(result.ok).toBe(true)
    await expect(readFile(path.join(targetRoot, 'cache', 'fresh.txt'), 'utf8')).resolves.toBe('fresh\n')
    await expect(readFile(path.join(targetRoot, 'cache', 'stale.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('rejects replacement paths outside the concrete manual plan', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'source\n')

    await expect(
      bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [{ path: '.env', mode: 'copy' }], {
        replaceExisting: [{ path: 'other.env', mode: 'copy' }],
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'Worktree bootstrap failed: invalid replacement target: other.env',
    })
  })

  test('keeps an approved existing copy target when temporary preparation fails', async () => {
    await mkdir(path.join(sourceRoot, 'cache'))
    await writeFile(path.join(sourceRoot, 'cache', 'fresh.txt'), 'fresh\n')
    await mkdir(path.join(targetRoot, 'cache'))
    await writeFile(path.join(targetRoot, 'cache', 'stale.txt'), 'stale\n')
    const copy = vi.spyOn(fs, 'cp').mockRejectedValueOnce(new Error('copy interrupted'))

    const result = await bootstrapWorktreeSelectionsAfterCreate(
      sourceRoot,
      targetRoot,
      [{ path: 'cache', mode: 'copy' }],
      { replaceExisting: [{ path: 'cache', mode: 'copy' }] },
    )

    copy.mockRestore()
    expect(result).toEqual({
      ok: false,
      message: 'Worktree bootstrap failed: failed to copy cache: copy interrupted',
    })
    await expect(readFile(path.join(targetRoot, 'cache', 'stale.txt'), 'utf8')).resolves.toBe('stale\n')
    await expect(readFile(path.join(targetRoot, 'cache', 'fresh.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('copies and symlinks manual selections using literal root paths', async () => {
    const literalName = 'local[1]*?.env'
    await writeFile(path.join(sourceRoot, literalName), 'TOKEN=placeholder\n')
    await mkdir(path.join(sourceRoot, 'node_modules'))

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: literalName, mode: 'copy' },
      { path: 'node_modules', mode: 'symlink' },
    ])

    expect(result).toEqual({
      ok: true,
      message: `Copied 1 path: ${literalName}\nSymlinked 1 path: node_modules`,
      worktreeBootstrap: {
        copy: { count: 1, paths: [literalName] },
        symlink: { count: 1, paths: ['node_modules'] },
        hardlink: { count: 0, paths: [] },
        skippedMissing: { count: 0, paths: [] },
      },
    })
    await expect(readFile(path.join(targetRoot, literalName), 'utf8')).resolves.toBe('TOKEN=placeholder\n')
    await expect(readlink(path.join(targetRoot, 'node_modules'))).resolves.toBe(path.join(sourceRoot, 'node_modules'))
  })

  test('does not treat goblin.toml as bootstrap configuration', async () => {
    await writeFile(path.join(sourceRoot, 'goblin.toml'), '[invalid')
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: '.env', mode: 'copy' },
    ])

    expect(result.ok).toBe(true)
    await expect(readFile(path.join(targetRoot, '.env'), 'utf8')).resolves.toBe('TOKEN=placeholder\n')
    await expect(readFile(path.join(targetRoot, 'goblin.toml'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('plans all manual destinations before writing any selection', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'source\n')
    await writeFile(path.join(sourceRoot, 'later.txt'), 'later\n')
    await writeFile(path.join(targetRoot, '.env'), 'target\n')

    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: '.env', mode: 'copy' },
      { path: 'later.txt', mode: 'copy' },
    ])

    expect(result).toEqual({
      ok: false,
      message: 'Worktree bootstrap failed: destination already exists: .env',
    })
    await expect(readFile(path.join(targetRoot, 'later.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  test('reports missing manual selections without failing', async () => {
    const result = await bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [
      { path: 'missing.env', mode: 'copy' },
    ])

    expect(result).toEqual({
      ok: true,
      message: 'Skipped missing 1 path: missing.env',
      worktreeBootstrap: {
        copy: { count: 0, paths: [] },
        symlink: { count: 0, paths: [] },
        hardlink: { count: 0, paths: [] },
        skippedMissing: { count: 1, paths: ['missing.env'] },
      },
    })
  })

  test('cancels manual materialization before resolving the repo root', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      bootstrapWorktreeSelectionsAfterCreate(sourceRoot, targetRoot, [{ path: '.env', mode: 'copy' }], {
        signal: controller.signal,
      }),
    ).resolves.toEqual({ ok: false, message: 'cancelled' })
  })
})
