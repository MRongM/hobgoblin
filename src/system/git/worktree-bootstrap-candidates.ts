import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  isWorktreeBootstrapCandidatePath,
  type WorktreeBootstrapCandidate,
  type WorktreeBootstrapCandidateScope,
  type WorktreeBootstrapPreflightResult,
  type WorktreeBootstrapSelection,
} from '#/shared/worktree-bootstrap-summary.ts'
import { getRepoRoot } from '#/system/git/branches.ts'
import { git } from '#/system/git/helper.ts'

export async function getLocalWorktreeBootstrapPreflight(
  sourceCwd: string,
  options: { signal?: AbortSignal; candidateScope?: WorktreeBootstrapCandidateScope } = {},
): Promise<WorktreeBootstrapPreflightResult> {
  try {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRoot = await getRepoRoot(sourceCwd, { signal: options.signal })
    if (!sourceRoot) return { ok: false, message: 'failed to resolve source repo root' }

    const candidates = await listCandidates(sourceRoot, options.candidateScope ?? 'all-untracked', options.signal)
    return { ok: true, preflight: { kind: 'candidates', candidates } }
  } catch (err) {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: errorMessage(err) }
  }
}

export async function validateLocalWorktreeBootstrapSelections(
  sourceCwd: string,
  selections: readonly WorktreeBootstrapSelection[],
  options: { signal?: AbortSignal; candidateScope?: WorktreeBootstrapCandidateScope } = {},
): Promise<ExecResult> {
  if (
    selections.some(
      (selection) =>
        !isWorktreeBootstrapCandidatePath(selection.path) ||
        (selection.mode !== 'copy' && selection.mode !== 'symlink'),
    )
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const preflight = await getLocalWorktreeBootstrapPreflight(sourceCwd, options)
  if (!preflight.ok) return preflight
  if (preflight.preflight.kind !== 'candidates') {
    return { ok: false, message: 'error.worktree-bootstrap-selection-stale' }
  }

  const currentCandidates = new Set(preflight.preflight.candidates.map((candidate) => candidate.path))
  const sourceRoot = await getRepoRoot(sourceCwd, { signal: options.signal })
  if (!sourceRoot) return { ok: false, message: 'failed to resolve source repo root' }
  for (const selection of selections) {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    if (currentCandidates.has(selection.path)) continue
    if (!(await pathExistsWithLstat(path.join(sourceRoot, selection.path)))) continue
    return { ok: false, message: 'error.worktree-bootstrap-selection-stale' }
  }
  return { ok: true, message: '' }
}

async function listCandidates(
  sourceRoot: string,
  candidateScope: WorktreeBootstrapCandidateScope,
  signal?: AbortSignal,
): Promise<WorktreeBootstrapCandidate[]> {
  const tracked = await git(sourceRoot, ['ls-files', '-z'], { signal })
  if (signal?.aborted) throw new Error('cancelled')
  const trackedRoots = new Set(
    tracked
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split('/', 1)[0]!),
  )
  const ignoredRoots =
    candidateScope === 'ignored-only'
      ? new Set(
          (
            await git(sourceRoot, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
              signal,
            })
          )
            .split('\0')
            .filter(Boolean)
            .map((entry) => entry.split('/', 1)[0]!),
        )
      : null
  if (signal?.aborted) throw new Error('cancelled')
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true })
  return entries
    .flatMap((entry): WorktreeBootstrapCandidate[] => {
      if (
        entry.name === '.git' ||
        trackedRoots.has(entry.name) ||
        (ignoredRoots !== null && !ignoredRoots.has(entry.name)) ||
        !isWorktreeBootstrapCandidatePath(entry.name)
      ) {
        return []
      }
      if (entry.isDirectory()) return [{ path: entry.name, kind: 'directory' }]
      if (entry.isFile()) return [{ path: entry.name, kind: 'file' }]
      return []
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    })
}

async function pathExistsWithLstat(target: string): Promise<boolean> {
  try {
    await fs.lstat(target)
    return true
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'ENOENT') {
      return false
    }
    throw err
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
