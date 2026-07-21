import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  isWorktreeBootstrapCandidatePath,
  type WorktreeBootstrapCandidate,
  type WorktreeBootstrapPreflightResult,
  type WorktreeBootstrapSelection,
} from '#/shared/worktree-bootstrap-summary.ts'
import { getRepoRoot } from '#/system/git/branches.ts'
import { git } from '#/system/git/helper.ts'
import { getWorktreeBootstrapPreview } from '#/system/git/worktree-bootstrap.ts'

const CONFIG_FILE = 'goblin.toml'

export async function getLocalWorktreeBootstrapPreflight(
  sourceCwd: string,
  options: { signal?: AbortSignal } = {},
): Promise<WorktreeBootstrapPreflightResult> {
  try {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    const sourceRoot = await getRepoRoot(sourceCwd, { signal: options.signal })
    if (!sourceRoot) return { ok: false, message: 'failed to resolve source repo root' }

    if (await pathExistsWithLstat(path.join(sourceRoot, CONFIG_FILE))) {
      const preview = await getWorktreeBootstrapPreview(sourceRoot, { signal: options.signal })
      return preview.ok ? { ok: true, preflight: { kind: 'configured', preview: preview.preview } } : preview
    }

    const candidates = await listCandidates(sourceRoot, options.signal)
    return { ok: true, preflight: { kind: 'candidates', candidates } }
  } catch (err) {
    if (options.signal?.aborted) return { ok: false, message: 'cancelled' }
    return { ok: false, message: errorMessage(err) }
  }
}

export async function validateLocalWorktreeBootstrapSelections(
  sourceCwd: string,
  selections: readonly WorktreeBootstrapSelection[],
  options: { signal?: AbortSignal } = {},
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

async function listCandidates(sourceRoot: string, signal?: AbortSignal): Promise<WorktreeBootstrapCandidate[]> {
  const tracked = await git(sourceRoot, ['ls-files', '-z'], { signal })
  if (signal?.aborted) throw new Error('cancelled')
  const trackedRoots = new Set(
    tracked
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split('/', 1)[0]!),
  )
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true })
  return entries
    .flatMap((entry): WorktreeBootstrapCandidate[] => {
      if (entry.name === '.git' || trackedRoots.has(entry.name) || !isWorktreeBootstrapCandidatePath(entry.name)) {
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
    if (isErrno(err, 'ENOENT')) return false
    throw err
  }
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === code
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
