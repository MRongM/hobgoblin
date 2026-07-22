import { describe, expect, test } from 'vitest'
import * as worktreeGuards from '#/shared/worktree-guards.ts'
import type { WorktreeInfo } from '#/shared/git-types.ts'

const { resolveKnownWorktree, resolveRemovableWorktree } = worktreeGuards

function resolvePrunableWorktree(worktrees: WorktreeInfo[], worktreePath: string, repoRoot: string) {
  const resolver = (worktreeGuards as Record<string, unknown>).resolvePrunableWorktree
  expect(resolver).toBeTypeOf('function')
  return (resolver as (items: WorktreeInfo[], targetPath: string, root: string) => unknown)(
    worktrees,
    worktreePath,
    repoRoot,
  )
}

describe('resolveKnownWorktree', () => {
  test('resolves a known worktree without a branch constraint', () => {
    const result = resolveKnownWorktree(
      [
        { path: '/repo', branch: 'main', isBare: false, isPrimary: true },
        { path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false },
      ],
      '/repo-linked',
    )
    expect(result).toEqual({ ok: true, path: '/repo-linked' })
  })

  test('rejects an unknown worktree path', () => {
    const result = resolveKnownWorktree(
      [{ path: '/repo', branch: 'main', isBare: false, isPrimary: true }],
      '/tmp/other',
    )
    expect(result).toEqual({ ok: false, message: 'error.invalid-worktree-path' })
  })

  test('rejects a known path checked out on a different branch', () => {
    const result = resolveKnownWorktree(
      [{ path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false }],
      '/repo-linked',
      'other',
    )
    expect(result).toEqual({ ok: false, message: 'error.worktree-not-found-for-branch' })
  })
})

describe('resolveRemovableWorktree', () => {
  const repoRoot = '/repo'
  const main = { path: '/repo', branch: 'main', isBare: false, isPrimary: true }
  const linked = { path: '/repo-linked', branch: 'feature', isBare: false, isPrimary: false }

  test('resolves a non-primary worktree', () => {
    const result = resolveRemovableWorktree([main, linked], 'feature', '/repo-linked', repoRoot)
    expect(result).toEqual({ ok: true, target: linked })
  })

  test('refuses the primary worktree by isPrimary flag', () => {
    const result = resolveRemovableWorktree([main, linked], 'main', '/repo', repoRoot)
    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-main-worktree' })
  })

  test('refuses when path resolves to the repo root even if isPrimary missed it', () => {
    // Defensive: parser should always set isPrimary for the first entry,
    // but if it didn't, the repo-root path check still catches it.
    const odd = { path: '/repo', branch: 'main', isBare: false, isPrimary: false }
    const result = resolveRemovableWorktree([odd], 'main', '/repo', repoRoot)
    expect(result).toEqual({ ok: false, message: 'error.cannot-remove-main-worktree' })
  })

  test('rejects when no worktree matches both branch and path', () => {
    const result = resolveRemovableWorktree([linked], 'feature', '/somewhere/else', repoRoot)
    expect(result).toEqual({ ok: false, message: 'error.worktree-not-found-for-branch' })
  })

  test('rejects when path matches but branch does not', () => {
    const result = resolveRemovableWorktree([linked], 'main', '/repo-linked', repoRoot)
    expect(result).toEqual({ ok: false, message: 'error.worktree-not-found-for-branch' })
  })
})

describe('resolvePrunableWorktree', () => {
  const repoRoot = '/repo'
  const stale = {
    path: '/repo-stale',
    branch: 'feature/stale',
    isBare: false,
    isPrimary: false,
    isPrunable: true,
  }

  test('resolves an explicitly prunable linked worktree', () => {
    expect(resolvePrunableWorktree([stale], '/repo-stale', repoRoot)).toEqual({ ok: true, target: stale })
  })

  test('rejects unknown and non-prunable paths', () => {
    expect(resolvePrunableWorktree([stale], '/other', repoRoot)).toEqual({
      ok: false,
      message: 'error.worktree-not-prunable',
    })
    expect(resolvePrunableWorktree([{ ...stale, isPrunable: false }], '/repo-stale', repoRoot)).toEqual({
      ok: false,
      message: 'error.worktree-not-prunable',
    })
  })

  test('rejects primary and locked worktrees', () => {
    expect(
      resolvePrunableWorktree([{ ...stale, path: repoRoot, isPrimary: true }], repoRoot, repoRoot),
    ).toEqual({ ok: false, message: 'error.cannot-remove-main-worktree' })
    expect(resolvePrunableWorktree([{ ...stale, isLocked: true }], '/repo-stale', repoRoot)).toEqual({
      ok: false,
      message: 'error.cannot-remove-locked-worktree',
    })
  })
})
