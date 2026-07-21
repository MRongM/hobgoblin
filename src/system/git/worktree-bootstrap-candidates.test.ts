import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  getLocalWorktreeBootstrapPreflight,
  validateLocalWorktreeBootstrapSelections,
} from '#/system/git/worktree-bootstrap-candidates.ts'

const mocks = vi.hoisted(() => ({
  getRepoRoot: vi.fn(),
  git: vi.fn(),
}))

vi.mock('#/system/git/branches.ts', () => ({
  getRepoRoot: mocks.getRepoRoot,
}))

vi.mock('#/system/git/helper.ts', () => ({
  git: mocks.git,
}))

let tmp = ''
let sourceRoot = ''

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'worktree-bootstrap-candidates-test-'))
  sourceRoot = path.join(tmp, 'repo')
  await mkdir(sourceRoot, { recursive: true })
  mocks.getRepoRoot.mockResolvedValue(sourceRoot)
  mocks.git.mockResolvedValue('')
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('local worktree bootstrap candidates', () => {
  test('lists wholly untracked root files and directories in stable order', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')
    await mkdir(path.join(sourceRoot, 'node_modules'))
    await mkdir(path.join(sourceRoot, 'config'))
    await writeFile(path.join(sourceRoot, 'config', 'tracked.json'), '{}\n')
    await writeFile(path.join(sourceRoot, 'config', 'local.json'), '{}\n')
    await writeFile(path.join(sourceRoot, 'README.md'), 'tracked\n')
    await symlink(path.join(sourceRoot, '.env'), path.join(sourceRoot, 'env-link'))
    mocks.git.mockResolvedValue('README.md\0config/tracked.json\0')

    await expect(getLocalWorktreeBootstrapPreflight(sourceRoot)).resolves.toEqual({
      ok: true,
      preflight: {
        kind: 'candidates',
        candidates: [
          { path: 'node_modules', kind: 'directory' },
          { path: '.env', kind: 'file' },
        ],
      },
    })
    expect(mocks.git).toHaveBeenCalledWith(sourceRoot, ['ls-files', '-z'], { signal: undefined })
  })

  test('returns configured preflight whenever goblin.toml exists without operations', async () => {
    await writeFile(path.join(sourceRoot, 'goblin.toml'), '')

    const result = await getLocalWorktreeBootstrapPreflight(sourceRoot)

    expect(result).toMatchObject({ ok: true, preflight: { kind: 'configured' } })
    expect(mocks.git).not.toHaveBeenCalled()
  })

  test('does not fall back to candidates when goblin.toml is invalid', async () => {
    await writeFile(path.join(sourceRoot, 'goblin.toml'), '[worktree\n')

    const result = await getLocalWorktreeBootstrapPreflight(sourceRoot)

    expect(result).toMatchObject({ ok: false })
    expect(mocks.git).not.toHaveBeenCalled()
  })

  test('rejects a selected path that became tracked', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')
    mocks.git.mockResolvedValue('.env\0')

    await expect(
      validateLocalWorktreeBootstrapSelections(sourceRoot, [{ path: '.env', mode: 'copy' }]),
    ).resolves.toEqual({ ok: false, message: 'error.worktree-bootstrap-selection-stale' })
  })

  test('rejects unsafe selections at the local system boundary', async () => {
    await expect(
      validateLocalWorktreeBootstrapSelections(sourceRoot, [{ path: '../outside.env', mode: 'copy' }]),
    ).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
  })

  test('allows a selected path that disappeared so materialization can report it missing', async () => {
    await expect(
      validateLocalWorktreeBootstrapSelections(sourceRoot, [{ path: '.env', mode: 'copy' }]),
    ).resolves.toEqual({ ok: true, message: '' })
  })

  test('returns cancelled without reading the repository when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(getLocalWorktreeBootstrapPreflight(sourceRoot, { signal: controller.signal })).resolves.toEqual({
      ok: false,
      message: 'cancelled',
    })
    expect(mocks.getRepoRoot).not.toHaveBeenCalled()
  })
})
