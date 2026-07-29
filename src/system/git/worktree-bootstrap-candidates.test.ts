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

  test('does not give a tracked goblin.toml special behavior', async () => {
    await writeFile(path.join(sourceRoot, 'goblin.toml'), '')
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')
    mocks.git.mockResolvedValue('goblin.toml\0')

    await expect(getLocalWorktreeBootstrapPreflight(sourceRoot)).resolves.toEqual({
      ok: true,
      preflight: { kind: 'candidates', candidates: [{ path: '.env', kind: 'file' }] },
    })
    expect(mocks.git).toHaveBeenCalledWith(sourceRoot, ['ls-files', '-z'], { signal: undefined })
  })

  test('lists only git-ignored root entries when requested', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')
    await mkdir(path.join(sourceRoot, 'node_modules'))
    await mkdir(path.join(sourceRoot, 'coverage'))
    mocks.git.mockImplementation(async (_cwd, args: string[]) => {
      if (args.includes('--ignored')) return 'node_modules/\0coverage/summary.json\0'
      return ''
    })

    await expect(getLocalWorktreeBootstrapPreflight(sourceRoot, { candidateScope: 'ignored-only' })).resolves.toEqual({
      ok: true,
      preflight: {
        kind: 'candidates',
        candidates: [
          { path: 'coverage', kind: 'directory' },
          { path: 'node_modules', kind: 'directory' },
        ],
      },
    })
    expect(mocks.git).toHaveBeenNthCalledWith(1, sourceRoot, ['ls-files', '-z'], { signal: undefined })
    expect(mocks.git).toHaveBeenNthCalledWith(
      2,
      sourceRoot,
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      { signal: undefined },
    )
  })

  test('does not parse a tracked goblin.toml while listing candidates', async () => {
    await writeFile(path.join(sourceRoot, 'goblin.toml'), '[worktree\n')
    mocks.git.mockResolvedValue('goblin.toml\0')

    await expect(getLocalWorktreeBootstrapPreflight(sourceRoot)).resolves.toEqual({
      ok: true,
      preflight: { kind: 'candidates', candidates: [] },
    })
    expect(mocks.git).toHaveBeenCalledWith(sourceRoot, ['ls-files', '-z'], { signal: undefined })
  })

  test('rejects a selected path that became tracked', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')
    mocks.git.mockResolvedValue('.env\0')

    await expect(
      validateLocalWorktreeBootstrapSelections(sourceRoot, [{ path: '.env', mode: 'copy' }]),
    ).resolves.toEqual({ ok: false, message: 'error.worktree-bootstrap-selection-stale' })
  })

  test('rejects an existing untracked selection outside the requested ignored-only scope', async () => {
    await writeFile(path.join(sourceRoot, '.env'), 'TOKEN=placeholder\n')

    await expect(
      validateLocalWorktreeBootstrapSelections(sourceRoot, [{ path: '.env', mode: 'copy' }], {
        candidateScope: 'ignored-only',
      }),
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
